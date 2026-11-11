const mongoose = require('mongoose');
const TermsAndConditions = require('../models/TermsAndConditions');
const User = require('../models/User');

const AUDIENCES = ['customer', 'vendor'];

/** Which audience a request is about. Anything unrecognised means customer. */
const readAudience = (value) => (AUDIENCES.includes(value) ? value : 'customer');

// Get current active terms
exports.getCurrentTerms = async (req, res) => {
  try {
    const audience = readAudience(req.query.audience);
    const terms = await TermsAndConditions.getCurrentTerms(audience);

    if (!terms) {
      return res.json({
        success: true,
        data: { terms: null },
      });
    }

    // If terms are in testing mode, return null for public access
    if (terms.isTesting) {
      return res.json({
        success: true,
        data: { terms: null },
      });
    }

    // Check if current user has accepted these terms
    let hasAccepted = false;
    if (req.user) {
      hasAccepted = terms.hasUserAccepted(req.user._id);
    }

    res.json({
      success: true,
      data: {
        terms: {
          _id: terms._id,
          title: terms.title,
          content: terms.content,
          version: terms.version,
          audience: terms.audience || 'customer',
          createdAt: terms.createdAt,
          hasAccepted,
        },
      },
    });
  } catch (error) {
    console.error('Get current terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions',
    });
  }
};

// Accept terms (for customers)
exports.acceptTerms = async (req, res) => {
  try {
    const { termsId } = req.body;
    const userId = req.user._id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    if (!termsId) {
      return res.status(400).json({
        success: false,
        message: 'Terms ID is required',
      });
    }

    const terms = await TermsAndConditions.findById(termsId);

    if (!terms || !terms.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found or inactive',
      });
    }

    // Check if user already accepted
    if (terms.hasUserAccepted(userId)) {
      return res.json({
        success: true,
        message: 'Terms already accepted',
      });
    }

    // Add acceptance
    await terms.addAcceptance(userId, ipAddress, userAgent);

    // Emit real-time update to admin
    if (req.io) {
      req.io.emit('termsAcceptanceUpdate', {
        termsId: terms._id,
        acceptanceCount: terms.acceptanceCount,
        newAcceptance: {
          userId,
          acceptedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      message: 'Terms and conditions accepted successfully',
    });
  } catch (error) {
    console.error('Accept terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept terms and conditions',
    });
  }
};

// Admin: Create new terms
exports.createTerms = async (req, res) => {
  try {
    const { title, content, version, isTesting } = req.body;
    const audience = readAudience(req.body.audience);

    console.log('📝 Create terms request:', { title, version });
    console.log('🔍 Admin user:', { id: req.user?._id, name: req.user?.name });

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required',
      });
    }

    if (!req.user) {
      console.error('❌ Create terms error: req.user is undefined');
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      });
    }

    // Retire the previous version for THIS audience only. Publishing new
    // partner terms must not quietly switch off the customer ones.
    await TermsAndConditions.updateMany(
      { isActive: true, ...TermsAndConditions.audienceFilter(audience) },
      { isActive: false }
    );

    // Create new terms - handle both system admin (string id) and database admins (ObjectId)
    let createdById = req.user._id;

    // If system admin (id === 'admin'), create a temporary ObjectId for reference
    if (createdById === 'admin') {
      createdById = new mongoose.Types.ObjectId();
    }

    const terms = new TermsAndConditions({
      title: title.trim(),
      content: content.trim(),
      version: version?.trim() || '1.0',
      audience,
      createdBy: createdById,
      isActive: true,
      isTesting: !!isTesting,
    });

    await terms.save();

    console.log('✅ Terms created:', { id: terms._id, title: terms.title });

    // Emit real-time notification to all customers
    if (req.io) {
      req.io.emit('newTermsCreated', {
        termsId: terms._id,
        title: terms.title,
        version: terms.version,
        audience: terms.audience,
        createdAt: terms.createdAt,
        isTesting: terms.isTesting,
      });
      console.log('📡 Socket event emitted: newTermsCreated');
    }

    res.status(201).json({
      success: true,
      message: 'Terms and conditions created successfully',
      data: { terms },
    });
  } catch (error) {
    console.error('❌ Create terms error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create terms and conditions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Admin: Get all terms with acceptance stats
exports.getAllTerms = async (req, res) => {
  try {
    // ?audience=vendor narrows the list; without it the admin sees both.
    const filter = AUDIENCES.includes(req.query.audience)
      ? TermsAndConditions.audienceFilter(req.query.audience)
      : {};

    const terms = await TermsAndConditions.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const termsWithStats = terms.map((term) => ({
      _id: term._id,
      title: term.title,
      content: term.content,
      version: term.version,
      audience: term.audience || 'customer',
      isActive: term.isActive,
      isTesting: term.isTesting,
      acceptanceCount: term.acceptanceCount,
      createdBy: term.createdBy,
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
    }));

    res.json({
      success: true,
      data: { terms: termsWithStats },
    });
  } catch (error) {
    console.error('Get all terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions',
    });
  }
};

// Admin: Get detailed acceptance data for specific terms
exports.getTermsAcceptanceDetails = async (req, res) => {
  try {
    const { termsId } = req.params;

    const terms = await TermsAndConditions.findById(termsId)
      .populate('acceptedBy.userId', 'name email phone')
      .populate('createdBy', 'name email');

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found',
      });
    }

    res.json({
      success: true,
      data: { terms },
    });
  } catch (error) {
    console.error('Get terms acceptance details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch acceptance details',
    });
  }
};

// Admin: Get live acceptance count
exports.getLiveAcceptanceCount = async (req, res) => {
  try {
    const { termsId } = req.params;

    const terms = await TermsAndConditions.findById(termsId);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found',
      });
    }

    res.json({
      success: true,
      data: {
        termsId: terms._id,
        acceptanceCount: terms.acceptanceCount,
        isActive: terms.isActive,
      },
    });
  } catch (error) {
    console.error('Get live acceptance count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch acceptance count',
    });
  }
};

// Admin: Delete terms
exports.deleteTerms = async (req, res) => {
  try {
    const { termsId } = req.params;

    const terms = await TermsAndConditions.findById(termsId);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found',
      });
    }

    await TermsAndConditions.findByIdAndDelete(termsId);

    res.json({
      success: true,
      message: 'Terms and conditions deleted successfully',
    });
  } catch (error) {
    console.error('Delete terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete terms',
    });
  }
};
