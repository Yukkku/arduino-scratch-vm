import { Firmata, WebSerialTransport } from "firmata-web";

const baudRate = 57600;

class Arduino {
  #runtime;
  #extensionId;
  #availablePorts = [];
  #firmata = null;

  constructor(runtime, extensionId) {
    this.#runtime = runtime;
    this.#extensionId = extensionId;
    runtime.registerPeripheralExtension(extensionId, this);
  }

  async scan() {
    console.log("Arduino:scan");
    const ports = await navigator.serial.getPorts();
    this.#availablePorts = ports;
    this.#runtime.emit(
      this.#runtime.constructor.PERIPHERAL_LIST_UPDATE,
      this.#availablePorts.map((port, i) => ({
        name: "Unknown Device",
        peripheralId: i,
        port,
      })),
    );
  }
  async connect(id) {
    console.log("Arduino:connect", id);
    console.log(this.#availablePorts);
    const port = this.#availablePorts[id];
    await port.open({ baudRate });
    const transport = new WebSerialTransport(port);
    const board = new Firmata(transport);
    console.log(board);

    board.on("ready", () => {
      this.#firmata = board;
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_CONNECTED);
    });

    board.on("close", () => {
      this.#firmata = null;
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_DISCONNECTED);
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
        message: `Scratch lost connection to`,
        extensionId: this.#extensionId
      });
    });
  }
  disconnect() {}

  isConnected() {
    return this.#firmata != null;
  }
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

export default ArduinoBlocks;
