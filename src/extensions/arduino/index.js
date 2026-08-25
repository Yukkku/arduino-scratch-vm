import { Firmata, WebSerialTransport } from "firmata-web";

const baudRate = 57600;

class Arduino {
  #runtime;
  #availablePorts = [];
  #firmata = null;

  constructor(runtime, extensionId) {
    this.#runtime = runtime;
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

    board.on("ready", () => {
      this.#firmata = board;
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_CONNECTED);

      // Arduino is ready to communicate
      const pin = 13;
      let state = 1;

      board.pinMode(pin, board.MODES.OUTPUT);

      setInterval(() => {
        board.digitalWrite(pin, (state ^= 1));
      }, 500);
    });

    board.on("close", () => {
      console.log("Closed!");
    });
  }
  disconnect() {
    console.log("Arduino:disconnect");
}
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
