const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  aboutUsText: {
    type: String,
    default: 'Welcome to PTV. This is the default about us text.'
  },
  contactEmail: {
    type: String,
    default: 'contact@ptv.com.bd'
  },
  contactPhone: {
    type: String,
    default: '+880 123 456 789'
  },
  contactAddress: {
    type: String,
    default: 'Dhaka, Bangladesh'
  },
  newsPortalLink: {
    type: String,
    default: 'https://news.ptv.com.bd'
  },
  ePaperLink: {
    type: String,
    default: 'https://epaper.ptv.com.bd'
  }
});

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
