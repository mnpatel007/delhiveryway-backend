const multer = require('multer');
const Shop = require('../models/Shop');
const ShopMenuFile = require('../models/ShopMenuFile');

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB, comfortably inside Mongo's 16 MB document cap

// The file is held in memory only long enough to write it to the database.
// Render wipes the disk on every deploy, so writing it to uploads/ would lose
// every shop's menu the next time the backend ships.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const looksLikePdf =
      file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    if (looksLikePdf) return cb(null, true);
    cb(new Error('Only PDF files can be uploaded as a menu.'));
  },
});

// Wrapped so a multer rejection comes back as a tidy JSON error instead of
// falling through to the generic 500 handler.
exports.uploadMiddleware = (req, res, next) => {
  upload.single('menu')(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(400).json({
      success: false,
      message: tooBig
        ? 'That PDF is larger than 8 MB. Please upload a smaller file.'
        : err.message || 'Could not read that file.',
    });
  });
};

const resolveShop = async (vendorId) => Shop.findOne({ vendorId });

const noShop = (res) =>
  res.status(404).json({
    success: false,
    message: 'No shop is linked to your account yet. Enter your access code first.',
  });

const describe = (shop) =>
  shop.menuPdf?.uploadedAt
    ? {
        filename: shop.menuPdf.filename,
        size: shop.menuPdf.size,
        uploadedAt: shop.menuPdf.uploadedAt,
        url: `/api/shops/${shop._id}/menu-pdf`,
      }
    : null;

// GET /shop-owner/menu-pdf — what the vendor currently has up, if anything.
exports.getMenuPdfInfo = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);
    res.json({ success: true, data: describe(shop) });
  } catch (error) {
    console.error('Get menu PDF info error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// POST /shop-owner/menu-pdf — replaces whatever was there before.
exports.uploadMenuPdf = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'Choose a PDF to upload.' });
    }

    // Trust the bytes, not the extension: a real PDF starts with %PDF-.
    if (req.file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({
        success: false,
        message: 'That file is not a PDF. Save your menu as a PDF and try again.',
      });
    }

    const filename = (req.file.originalname || 'menu.pdf').slice(-200);

    await ShopMenuFile.findOneAndUpdate(
      { shopId: shop._id },
      {
        shopId: shop._id,
        filename,
        contentType: 'application/pdf',
        size: req.file.size,
        data: req.file.buffer,
        uploadedBy: req.user._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    shop.menuPdf = { filename, size: req.file.size, uploadedAt: new Date() };
    await shop.save();

    res.json({
      success: true,
      message: 'Menu uploaded. Customers can open it from your shop page.',
      data: describe(shop),
    });
  } catch (error) {
    console.error('Upload menu PDF error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE /shop-owner/menu-pdf
exports.deleteMenuPdf = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    await ShopMenuFile.deleteOne({ shopId: shop._id });
    shop.menuPdf = undefined;
    await shop.save();

    res.json({ success: true, message: 'Menu removed.', data: null });
  } catch (error) {
    console.error('Delete menu PDF error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET /shops/:id/menu-pdf — public, this is the link customers open.
exports.serveMenuPdf = async (req, res) => {
  try {
    const file = await ShopMenuFile.findOne({ shopId: req.params.id });
    if (!file) {
      return res.status(404).json({ success: false, message: 'This shop has no menu PDF.' });
    }

    // inline so it opens in the browser's own viewer rather than downloading.
    // The filename is quoted and stripped of characters that would let it break
    // out of the header.
    const safeName = (file.filename || 'menu.pdf').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', file.contentType || 'application/pdf');
    res.setHeader('Content-Length', file.data.length);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(file.data);
  } catch (error) {
    console.error('Serve menu PDF error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
