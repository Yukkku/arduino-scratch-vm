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
    const port = this.#availablePorts[id];
    await port.open({ baudRate });
    const transport = new WebSerialTransport(port);
    const board = new Firmata(transport);

    board.on("ready", () => {
      console.log(board);
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
    for (const pin of this.digitalInPins()) {
      this.#firmata.pinMode(pin, this.#firmata.MODES.INPUT);
      this.#firmata.digitalRead(pin, val => {
        this.#digitalCache.set(pin, val);
      });
    }
  }

  analogPins() {
    if (this.#firmata == null) return [];
    return Object.values(this.#firmata.analogPinLookup);
  }
  digitalInOutPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.INPUT)
          && pin.supportedModes.includes(MODES.OUTPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(id);
    }
    return r;
  }
  digitalInPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.INPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(id);
    }
    return r;
  }
  digitalOutPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.OUTPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(id);
    }
    return r;
  }

  setInputMode(pin) {
    this.#firmata.pinMode(pin, this.#firmata.MODES.INPUT);
  }
  setOutputMode(pin) {
    this.#firmata.pinMode(pin, this.#firmata.MODES.OUTPUT);
  }

  analogRead(pin) {
    return this.#analogCache.get(pin);
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
    return {
      id: "arduino",
      name: "Arduino",
      showStatusButton: true,
      blocks: [
        {
          opcode: "setMode",
          text: "[PIN]ピンを[MODE]モードにする",
          blockType: BlockType.COMMAND,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalInOutPins",
            },
            MODE: {
              type: ArgumentType.STRING,
              menu: "modes",
            },
          },
        },
        {
          opcode: "analogRead",
          text: "A[PIN]",
          blockType: BlockType.REPORTER,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "analogPins",
            },
          },
        },
        {
          opcode: "digitalRead",
          text: "D[PIN]",
          blockType: BlockType.BOOLEAN,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalInPins",
            },
          },
        }
      ],
      menus: {
        modes: {
          acceptReporters: false,
          items: [
            { text: "入力", value: "INPUT" },
            { text: "出力", value: "OUTPUT" },
          ],
        },
        analogPins: {
          acceptReporters: false,
          items: "analogPinsMenu",
        },
        digitalInOutPins: {
          acceptReporters: false,
          items: "digitalInOutPinsMenu",
        },
        digitalInPins: {
          acceptReporters: false,
          items: "digitalInPinsMenu",
        },
        digitalOutPins: {
          acceptReporters: false,
          items: "digitalOutPinsMenu",
        },
      },
    };
  }

  analogPinsMenu() {
    const r = this.#peripheral.analogPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalInOutPinsMenu() {
    const r = this.#peripheral.digitalInOutPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalInPinsMenu() {
    const r = this.#peripheral.digitalInPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalOutPinsMenu() {
    const r = this.#peripheral.digitalOutPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }

  setMode({ PIN, MODE }) {
    const pin = Cast.toNumber(PIN);
    if (MODE === "INPUT") this.#peripheral.setInputMode(pin);
    if (MODE === "OUTPUT") this.#peripheral.setOutputMode(pin);
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
