// Copies any classification the caller supplies. Raw observations default to normal.
module.exports = class EchoNetworkAdapter {
  events = [];

  getCapabilities() {
    return { product: this.constructor.name, version: '0', capabilities: new Set(['network-monitoring']) };
  }

  async start() {}
  async stop() {}

  classify({ category = 'normal', severity = 'info' }) {
    return { category, severity };
  }

  async injectEvent(event) {
    this.events.push(event);
    return event;
  }

  observeConnections(connections) {
    return Promise.all(connections.map((data) => this.injectEvent({
      source: 'network', description: `Connection to ${data.remoteAddr}`, data, ...this.classify(data),
    })));
  }

  getEvents() { return this.events; }
  getEventsByCategory(category) { return this.events.filter((event) => event.category === category); }
};
