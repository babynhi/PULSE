const { withEntitlementsPlist } = require('expo/config-plugins');

// PULSE only uses LOCAL notifications (lock-screen danger alerts), which need no entitlement.
// expo-notifications adds aps-environment for remote push; drop it so builds sign without the
// Push Notifications capability.
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
