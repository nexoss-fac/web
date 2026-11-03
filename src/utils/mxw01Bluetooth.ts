/**
 * Cliente Web Bluetooth para impresoras térmicas MXW01.
 * Protocolo no oficial, documentado por ingeniería inversa. Requiere HTTPS
 * y Chromium con Web Bluetooth habilitado. La prueba física sigue siendo obligatoria.
 */
type BleCharacteristic = {
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
  startNotifications?: () => Promise<BleCharacteristic>;
  addEventListener?: (type: string, listener: (event: { target?: { value?: DataView } }) => void) => void;
};
type BleDevice = {
  name?: string;
  gatt?: {
    connect: () => Promise<{ getPrimaryService: (uuid: string) => Promise<{ getCharacteristic: (uuid: string) => Promise<BleCharacteristic> }> }>;
  };
};
type BluetoothApi = {
  requestDevice: (options: unknown) => Promise<BleDevice>;
};

const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const CONTROL = '0000ae01-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';
const DATA = '0000ae03-0000-1000-8000-00805f9b34fb';
const PRINT_WIDTH = 384;
const CHUNK_SIZE = 180;

function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function controlFrame(command: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(payload.length + 8);
  frame.set([0x22, 0x21, command, 0x00, payload.length & 0xff, (payload.length >> 8) & 0xff], 0);
  frame.set(payload, 6);
  frame[6 + payload.length] = crc8(payload);
  frame[7 + payload.length] = 0xff;
  return frame;
}

async function writeBle(characteristic: BleCharacteristic, bytes: Uint8Array): Promise<void> {
  if (characteristic.writeValueWithoutResponse) {
    await characteristic.writeValueWithoutResponse(bytes);
  } else if (characteristic.writeValue) {
    await characteristic.writeValue(bytes);
  } else {
    throw new Error('La impresora no ofrece escritura Bluetooth compatible.');
  }
}

function toPrinterRaster(source: HTMLCanvasElement): { bytes: Uint8Array; lines: number } {
  const scale = Math.min(PRINT_WIDTH / source.width, 1);
  const imageWidth = Math.max(1, Math.round(source.width * scale));
  const imageHeight = Math.max(1, Math.round(source.height * scale));
  const image = document.createElement('canvas');
  image.width = PRINT_WIDTH;
  image.height = imageHeight;
  const ctx = image.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo preparar la imagen para la impresora.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, Math.floor((PRINT_WIDTH - imageWidth) / 2), 0, imageWidth, imageHeight);

  const pixels = ctx.getImageData(0, 0, PRINT_WIDTH, imageHeight).data;
  const bytes = new Uint8Array(imageHeight * (PRINT_WIDTH / 8));
  const rowBytes = PRINT_WIDTH / 8;
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < PRINT_WIDTH; x += 1) {
      const index = (y * PRINT_WIDTH + x) * 4;
      const luminance = (pixels[index] * 299 + pixels[index + 1] * 587 + pixels[index + 2] * 114) / 1000;
      if (luminance < 180) {
        const byteIndex = y * rowBytes + Math.floor(x / 8);
        bytes[byteIndex] |= 1 << (x % 8);
      }
    }
  }
  return { bytes, lines: imageHeight };
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function printCanvasToMxw01(canvas: HTMLCanvasElement, copies = 1): Promise<void> {
  if (!window.isSecureContext) throw new Error('La impresión Bluetooth requiere abrir NEXOSS mediante HTTPS.');
  const bluetooth = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
  if (!bluetooth) throw new Error('Este navegador no ofrece Web Bluetooth. Usa Edge o Chrome actualizado.');
  if (!canvas || canvas.width < 1 || canvas.height < 1) throw new Error('La etiqueta está vacía.');

  const device = await bluetooth.requestDevice({
    filters: [{ namePrefix: 'MXW01' }],
    optionalServices: [SERVICE],
  });
  if (!device.gatt) throw new Error('No se pudo abrir la conexión Bluetooth de la MXW01.');

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE);
  const control = await service.getCharacteristic(CONTROL);
  const data = await service.getCharacteristic(DATA);
  const notify = await service.getCharacteristic(NOTIFY);
  if (notify.startNotifications) await notify.startNotifications();

  const raster = toPrinterRaster(canvas);
  const safeCopies = Math.max(1, Math.min(100, Math.floor(copies)));
  if (raster.lines > 0xffff) throw new Error('La etiqueta supera la longitud admitida por la impresora.');

  try {
    // Estado e intensidad de impresión. El firmware no documenta oficialmente los ACK.
    await writeBle(control, controlFrame(0xa2, new Uint8Array([0x5d])));
    await writeBle(control, controlFrame(0xa1, new Uint8Array([0x00])));
    await wait(250);

    const startPayload = new Uint8Array([raster.lines & 0xff, (raster.lines >> 8) & 0xff, 0x30, 0x00]);
    for (let copy = 0; copy < safeCopies; copy += 1) {
      await writeBle(control, controlFrame(0xa9, startPayload));
      await wait(250);
      for (let offset = 0; offset < raster.bytes.length; offset += CHUNK_SIZE) {
        const chunk = raster.bytes.slice(offset, Math.min(offset + CHUNK_SIZE, raster.bytes.length));
        await writeBle(data, chunk);
        await wait(Math.max(12, Math.ceil((chunk.length / 48) * 12)));
      }
      await writeBle(control, controlFrame(0xad, new Uint8Array([0x00])));
      await wait(700);
    }
  } finally {
    if (server.connected) server.disconnect();
  }
}
