import { Firmata, WebSerialTransport } from "firmata-web";

import ArgumentType from "../../extension-support/argument-type";
import BlockType from "../../extension-support/block-type";
import Cast from "../../util/cast";

const baudRate = 57600;

class Arduino {
  #runtime;
  #extensionId;
  #availablePorts = [];
  #firmata = null;
  #analogCache = new Map();
  #digitalCache = new Map();

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
      this.#setup();
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
  disconnect() {
    alert("TODO");
  }
  isConnected() {
    return this.#firmata != null;
  }

  #setup() {
    for (const pin of this.analogPins()) {
      this.#firmata.analogRead(pin, val => {
        this.#analogCache.set(pin, val);
      });
    }
    for (const pin of this.digitalPins()) {
      this.#firmata.digitalRead(pin, val => {
        this.#digitalCache.set(pin, val);
      });
    }
  }

  analogPins() {
    if (this.#firmata == null) return [];
    return Object.values(this.#firmata.analogPinLookup);
  }
  analogRead(pin) {
    return this.#analogCache.get(pin);
  }

  digitalPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.INPUT) && !pin.supportedModes.includes(MODES.ANALOG)) r.push(id);
    }
    return r;
  }
  digitalRead(pin) {
    return this.#digitalCache.get(pin);
  }
}

class ArduinoBlocks {
  #runtime;
  #peripheral;

  constructor(runtime) {
    this.#runtime = runtime;
    this.#peripheral = new Arduino(runtime, "arduino");
  }

  getInfo() {
    const analogPins = this.#peripheral.analogPins();
    const digitalPins = this.#peripheral.digitalPins();
    const blocks = [];

    if (analogPins.length > 0) {
      blocks.push({
        opcode: "analogRead",
        text: "A[PIN]",
        blockType: BlockType.REPORTER,
        arguments: {
          PIN: {
            type: ArgumentType.STRING,
            menu: "analogPins",
            defaultValue: String(analogPins[0]),
          },
        },
      });
    }
    if (digitalPins.length > 0) {
      blocks.push({
        opcode: "digitalRead",
        text: "D[PIN]",
        blockType: BlockType.BOOLEAN,
        arguments: {
          PIN: {
            type: ArgumentType.STRING,
            menu: "digitalPins",
            defaultValue: String(digitalPins[0]),
          },
        },
      });
    }
    return {
      id: "arduino",
      name: "Arduino",
      showStatusButton: true,
      blocks,
      menus: {
        analogPins: {
          acceptReporters: false,
          items: analogPins.map(String),
        },
        digitalPins: {
          acceptReporters: false,
          items: digitalPins.map(String),
        },
      },
    };
  }

  analogRead({ PIN }) {
    const pin = Cast.toNumber(PIN);
    return Math.round((this.#peripheral.analogRead(pin) ?? 0) / 1.023) / 10;
  }
  digitalRead({ PIN }) {
    const pin = Cast.toNumber(PIN);
    return Boolean(this.#peripheral.digitalRead(pin) ?? 0);
  }
}

export default ArduinoBlocks;
