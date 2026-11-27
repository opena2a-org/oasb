const EchoNetworkAdapter = require('./echo-network-adapter.cjs');

module.exports = class ConstantAlarmNetworkAdapter extends EchoNetworkAdapter {
  classify() { return { category: 'threat', severity: 'critical' }; }
};
