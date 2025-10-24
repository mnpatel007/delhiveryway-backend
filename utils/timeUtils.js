// Utility functions for Indian Standard Time (IST) handling

/**
 * Get current time in IST (Indian Standard Time)
 * @returns {Date} Current time in IST
 */
const getCurrentISTTime = () => {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

/**
 * Get current time string in HH:MM format in IST
 * @returns {string} Current time in HH:MM format
 */
const getCurrentISTTimeString = () => {
    const istTime = getCurrentISTTime();
    return istTime.toTimeString().slice(0, 5);
};

/**
 * Get current day name in lowercase for shop hours lookup
 * @returns {string} Day name in lowercase (sunday, monday, etc.)
 */
const getCurrentISTDay = () => {
    const istTime = getCurrentISTTime();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return dayNames[istTime.getDay()];
};

/**
 * Get current day name in proper case for display
 * @returns {string} Day name in proper case (Sunday, Monday, etc.)
 */
const getCurrentISTDayDisplay = () => {
    const istTime = getCurrentISTTime();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[istTime.getDay()];
};

module.exports = {
    getCurrentISTTime,
    getCurrentISTTimeString,
    getCurrentISTDay,
    getCurrentISTDayDisplay
};


