class Arduino {
  #runtime;

  constructor(runtime, extensionId) {
    this.#runtime = runtime;
    runtime.registerPeripheralExtension(extensionId, this);
  }

  scan() {}
  connect() {}
  disconnect() {}
  isConnected() {}
}

class ArduinoBlocks {
  #runtime;
  #peripheral;

  constructor(runtime) {
    this.#runtime = runtime;
    this.#peripheral = new Arduino(runtime, "arduino");
  }

  getInfo () {
    return {
      id: "arduino",
      name: "Arduino",
      showStatusButton: true,
      blocks: [],
    };
  }
}

module.exports = ArduinoBlocks;
