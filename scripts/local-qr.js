/*
 * Local QR encoder for MFA setup
 *
 * Ported to JavaScript from the ReportLab QR encoder, which was itself ported
 * from Kazuhiko Arase's MIT-licensed QRCode for JavaScript implementation.
 *
 * Copyright (c) 2009 Kazuhiko Arase
 * Licensed under the MIT license:
 *   http://www.opensource.org/licenses/mit-license.php
 */

class QR8bitByte {
  constructor(data) {
    this.mode = 0x4;
    this.lengthbits = [8, 16, 16];
    this.data = new TextEncoder().encode(String(data || ""));
  }

  getLengthBits(version) {
    if (version > 0 && version < 10) return this.lengthbits[0];
    if (version < 27) return this.lengthbits[1];
    if (version < 41) return this.lengthbits[2];
    throw new Error(`Unknown version: ${version}`);
  }

  write(buffer, version) {
    buffer.put(this.mode, 4);
    buffer.put(this.data.length, this.getLengthBits(version));
    for (const byte of this.data) {
      buffer.put(byte, 8);
    }
  }
}

class QRCode {
  constructor(version, errorCorrectLevel) {
    this.version = version;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
    this._dataPosList = null;
    this._dataBitList = null;
  }

  addData(data) {
    this.dataList.push(data instanceof QR8bitByte ? data : new QR8bitByte(data));
    this.dataCache = null;
  }

  isDark(row, col) {
    return Boolean(this.modules[row][col]);
  }

  getModuleCount() {
    return this.moduleCount;
  }

  calculateVersion() {
    for (let version = 1; version < 40; version += 1) {
      const rsBlocks = QRRSBlock.getRSBlocks(version, this.errorCorrectLevel);
      const totalDataCount = rsBlocks.reduce((sum, block) => sum + block.dataCount, 0);
      let length = 0;
      for (const data of this.dataList) {
        length += 4;
        length += data.getLengthBits(version);
        length += data.data.length * 8;
      }
      if (length <= totalDataCount * 8) {
        return version;
      }
    }
    throw new Error("QR data too large");
  }

  make() {
    if (this.version == null) {
      this.version = this.calculateVersion();
    }
    this.makeImpl(false, this.getBestMaskPattern());
  }

  makeImpl(test, maskPattern) {
    this.moduleCount = this.version * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () => Array(this.moduleCount).fill(false));
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.version >= 7) {
      this.setupTypeNumber(test);
    }
    if (this.dataCache == null) {
      this.dataCache = QRCode.createData(this.version, this.errorCorrectLevel, this.dataList);
    }
    this.mapData(this.dataCache, maskPattern);
  }

  setupPositionProbePattern(row, col) {
    const pattern = [
      [true, true, true, true, true, true, true],
      [true, false, false, false, false, false, true],
      [true, false, true, true, true, false, true],
      [true, false, true, true, true, false, true],
      [true, false, true, true, true, false, true],
      [true, false, false, false, false, false, true],
      [true, true, true, true, true, true, true]
    ];

    if (row === 0) {
      this.modules[row + 7].splice(col, 7, ...Array(7).fill(false));
      this.modules[row + 7][col === 0 ? col + 7 : col - 1] = false;
    } else {
      this.modules[row - 1].splice(col, 8, ...Array(8).fill(false));
    }

    for (let r = 0; r < pattern.length; r += 1) {
      this.modules[row + r].splice(col, 7, ...pattern[r]);
      this.modules[row + r][col === 0 ? col + 7 : col - 1] = false;
    }
  }

  getBestMaskPattern() {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i += 1) {
      this.makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(this);
      if (i === 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  }

  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r += 1) {
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c += 1) {
      this.modules[6][c] = c % 2 === 0;
    }
  }

  setupPositionAdjustPattern() {
    const pos = QRUtil.getPatternPosition(this.version);
    const maxpos = this.moduleCount - 8;
    const pattern = [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, false, true, false, true],
      [true, false, false, false, true],
      [true, true, true, true, true]
    ];

    for (const row of pos) {
      for (const col of pos) {
        if (col <= 8 && (row <= 8 || row >= maxpos)) continue;
        if (col >= maxpos && row <= 8) continue;
        for (let r = 0; r < pattern.length; r += 1) {
          this.modules[row + r - 2].splice(col - 2, 5, ...pattern[r]);
        }
      }
    }
  }

  setupTypeNumber(test) {
    const bits = QRUtil.getBCHTypeNumber(this.version);
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 11] = mod;
    }
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[(i % 3) + this.moduleCount - 11][Math.floor(i / 3)] = mod;
    }
  }

  setupTypeInfo(test, maskPattern) {
    const data = (this.errorCorrectLevel << 3) | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);

    for (let i = 0; i < 15; i += 1) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }

    for (let i = 0; i < 15; i += 1) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i] = mod;
      else this.modules[8][14 - i] = mod;
    }

    this.modules[this.moduleCount - 8][8] = !test;
  }

  dataPosIterator() {
    if (this._dataPosList) return this._dataPosList;

    const result = [];
    const cols = [];
    for (let c = this.moduleCount - 1; c > 6; c -= 2) cols.push(c);
    for (let c = 5; c > 0; c -= 2) cols.push(c);

    const rowsA = Array.from({ length: this.moduleCount - 17 }, (_, i) => i + 9);
    const rowsB = [...Array.from({ length: 6 }, (_, i) => i), ...Array.from({ length: this.moduleCount - 7 }, (_, i) => i + 7)];
    const rowsC = Array.from({ length: this.moduleCount - 9 }, (_, i) => i + 9);
    let rows = [rowsA, rowsB, rowsC];
    let rrows = rows.map((entry) => [...entry].reverse());

    const ppos = new Set(QRUtil.getPatternPosition(this.version).flatMap((p) => [p - 2, p - 1, p, p + 1, p + 2]));
    const maxpos = this.moduleCount - 11;

    for (const col of cols) {
      [rows, rrows] = [rrows, rows];
      const rowidx = col <= 8 ? 0 : (col >= this.moduleCount - 8 ? 2 : 1);
      for (const row of rows[rowidx]) {
        for (let delta = 0; delta < 2; delta += 1) {
          const c = col - delta;
          if (this.version >= 7) {
            if (row < 6 && c >= this.moduleCount - 11) continue;
            if (col < 6 && row >= this.moduleCount - 11) continue;
          }
          if (ppos.has(row) && ppos.has(c)) {
            const inFinder = (row < 11 && (c < 11 || c > maxpos)) || (c < 11 && (row < 11 || row > maxpos));
            if (!inFinder) continue;
          }
          result.push([c, row]);
        }
      }
    }

    this._dataPosList = result;
    return result;
  }

  dataBitIterator(data) {
    if (!this._dataBitList) {
      this._dataBitList = [];
      for (const byte of data) {
        for (const bit of [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01]) {
          this._dataBitList.push(Boolean(byte & bit));
        }
      }
    }
    return this._dataBitList.values();
  }

  mapData(data, maskPattern) {
    const bits = this.dataBitIterator(data);
    const mask = QRUtil.getMask(maskPattern);
    for (const [col, row] of this.dataPosIterator()) {
      const next = bits.next();
      const dark = next.done ? false : next.value;
      this.modules[row][col] = dark ^ mask(row, col);
    }
  }

  static createData(version, errorCorrectLevel, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(version, errorCorrectLevel);
    const buffer = new QRBitBuffer();
    for (const data of dataList) {
      data.write(buffer, version);
    }

    const totalDataCount = rsBlocks.reduce((sum, block) => sum + block.dataCount, 0);
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw new Error(`code length overflow. (${buffer.getLengthInBits()} > ${totalDataCount * 8})`);
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 !== 0) {
      buffer.putBit(false);
    }
    while (buffer.getLengthInBits() < totalDataCount * 8) {
      buffer.put(0xec, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(0x11, 8);
    }
    return QRCode.createBytes(buffer, rsBlocks);
  }

  static createBytes(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = [];
    const ecdata = [];

    for (const block of rsBlocks) {
      const dcCount = block.dataCount;
      const ecCount = block.totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);

      const currentDc = buffer.buffer.slice(offset, offset + dcCount);
      dcdata.push(currentDc);
      offset += dcCount;

      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = new QRPolynomial(currentDc, rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      const rLen = rsPoly.getLength() - 1;
      const mLen = modPoly.getLength();
      const currentEc = [];
      for (let i = mLen - rLen; i < mLen; i += 1) {
        currentEc.push(i >= 0 ? modPoly.get(i) : 0);
      }
      ecdata.push(currentEc);
    }

    const data = [];
    for (let i = 0; i < maxDcCount; i += 1) {
      for (const row of dcdata) {
        if (i < row.length) data.push(row[i]);
      }
    }
    for (let i = 0; i < maxEcCount; i += 1) {
      for (const row of ecdata) {
        if (i < row.length) data.push(row[i]);
      }
    }
    return data;
  }
}

const QRErrorCorrectLevel = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};

const EXP_TABLE = Array.from({ length: 256 }, (_, i) => i);
const LOG_TABLE = Array.from({ length: 256 }, (_, i) => i);
for (let i = 0; i < 8; i += 1) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i += 1) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i += 1) {
  LOG_TABLE[EXP_TABLE[i]] = i;
}

class QRMath {
  static glog(n) {
    if (n < 1) throw new Error(`glog(${n})`);
    return LOG_TABLE[n];
  }

  static gexp(n) {
    while (n < 0) n += 255;
    while (n >= 256) n -= 255;
    return EXP_TABLE[n];
  }
}

class QRPolynomial {
  constructor(num, shift) {
    if (num.length === 0) throw new Error(`${num.length}/${shift}`);
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset += 1;
    this.num = [...num.slice(offset), ...Array(shift).fill(0)];
  }

  get(index) {
    return this.num[index];
  }

  getLength() {
    return this.num.length;
  }

  multiply(other) {
    const num = Array(this.getLength() + other.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i += 1) {
      for (let j = 0; j < other.getLength(); j += 1) {
        num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(other.get(j)));
      }
    }
    return new QRPolynomial(num, 0);
  }

  mod(other) {
    if (this.getLength() < other.getLength()) return this;
    const ratio = QRMath.glog(this.num[0]) - QRMath.glog(other.num[0]);
    const num = this.num.map((value, index) => {
      if (index < other.num.length) {
        return value ^ QRMath.gexp(QRMath.glog(other.num[index]) + ratio);
      }
      return value;
    });
    return new QRPolynomial(num, 0).mod(other);
  }
}

class QRRSBlock {
  constructor(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }

  static getRSBlocks(version, errorCorrectLevel) {
    const rsBlock = QRRSBlock.getRsBlockTable(version, errorCorrectLevel);
    if (rsBlock == null) {
      throw new Error(`bad rs block @ version:${version}/errorCorrectLevel:${errorCorrectLevel}`);
    }
    const length = Math.floor(rsBlock.length / 3);
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const count = rsBlock[i * 3];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j += 1) {
        list.push(new QRRSBlock(totalCount, dataCount));
      }
    }
    return list;
  }

  static getRsBlockTable(version, errorCorrectLevel) {
    const index = (version - 1) * 4;
    if (errorCorrectLevel === QRErrorCorrectLevel.L) return QRRSBlock.RS_BLOCK_TABLE[index];
    if (errorCorrectLevel === QRErrorCorrectLevel.M) return QRRSBlock.RS_BLOCK_TABLE[index + 1];
    if (errorCorrectLevel === QRErrorCorrectLevel.Q) return QRRSBlock.RS_BLOCK_TABLE[index + 2];
    if (errorCorrectLevel === QRErrorCorrectLevel.H) return QRRSBlock.RS_BLOCK_TABLE[index + 3];
    return null;
  }
}

QRRSBlock.RS_BLOCK_TABLE = [
  [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
  [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
  [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
  [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
  [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
  [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
  [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
  [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
  [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
  [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
  [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
  [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
  [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
  [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
  [5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12],
  [5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
  [1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
  [5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
  [3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
  [3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
  [4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
  [2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
  [4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
  [6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
  [8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
  [10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
  [8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
  [3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
  [7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
  [5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
  [13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
  [17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
  [17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
  [13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
  [12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
  [6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
  [17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
  [4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
  [20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
  [19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
];

class QRBitBuffer {
  constructor() {
    this.buffer = [];
    this.length = 0;
  }

  put(num, length) {
    for (let i = 0; i < length; i += 1) {
      this.putBit(((num >> (length - i - 1)) & 1) === 1);
    }
  }

  getLengthInBits() {
    return this.length;
  }

  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >> (this.length % 8);
    }
    this.length += 1;
  }
}

class QRUtil {
  static PATTERN_POSITION_TABLE = [
    [],
    [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
    [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
    [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];

  static G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  static G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
  static G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

  static getBCHTypeInfo(data) {
    let d = data << 10;
    while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
      d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
    }
    return ((data << 10) | d) ^ QRUtil.G15_MASK;
  }

  static getBCHTypeNumber(data) {
    let d = data << 12;
    while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
      d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
    }
    return (data << 12) | d;
  }

  static getBCHDigit(data) {
    let digit = 0;
    while (data !== 0) {
      digit += 1;
      data >>= 1;
    }
    return digit;
  }

  static getPatternPosition(version) {
    return QRUtil.PATTERN_POSITION_TABLE[version - 1];
  }

  static getMask(maskPattern) {
    return {
      0: (i, j) => (i + j) % 2 === 0,
      1: (i) => i % 2 === 0,
      2: (_, j) => j % 3 === 0,
      3: (i, j) => (i + j) % 3 === 0,
      4: (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
      5: (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
      6: (i, j) => ((((i * j) % 2) + ((i * j) % 3)) % 2) === 0,
      7: (i, j) => ((((i * j) % 3) + ((i + j) % 2)) % 2) === 0
    }[maskPattern];
  }

  static getErrorCorrectPolynomial(errorCorrectLength) {
    let a = new QRPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i += 1) {
      a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
    }
    return a;
  }

  static getLostPoint(qrCode) {
    const modules = qrCode.modules;
    let lostPoint = 0;

    lostPoint += QRUtil.maskScoreRule1vert(modules);
    lostPoint += QRUtil.maskScoreRule1vert(transpose(modules));
    lostPoint += QRUtil.maskScoreRule2(modules);
    lostPoint += QRUtil.maskScoreRule3hor(modules);
    lostPoint += QRUtil.maskScoreRule3hor(transpose(modules));
    lostPoint += QRUtil.maskScoreRule4(modules);

    return lostPoint;
  }

  static maskScoreRule1vert(modules) {
    let score = 0;
    let lastCount = [0];
    let lastRow = null;
    for (const row of modules) {
      if (lastRow) {
        const changed = row.map((cell, index) => cell ^ lastRow[index]);
        const scores = changed.map((change, index) => (change && lastCount[index] >= 4 ? lastCount[index] - 4 + 3 : 0));
        score += scores.reduce((sum, value) => sum + value, 0);
        lastCount = changed.map((change, index) => (change ? 0 : (lastCount[index] || 0) + 1));
      }
      lastRow = row;
    }
    score += lastCount.filter((value) => value >= 4).reduce((sum, value) => sum + (value - 4 + 3), 0);
    return score;
  }

  static maskScoreRule2(modules) {
    let score = 0;
    let lastRow = modules[0];
    for (const row of modules.slice(1)) {
      let lastCol0 = row[0];
      let lastCol1 = lastRow[0];
      for (let index = 1; index < row.length; index += 1) {
        const col0 = row[index];
        const col1 = lastRow[index];
        if (col0 === col1 && col1 === lastCol0 && lastCol0 === lastCol1) score += 3;
        lastCol0 = col0;
        lastCol1 = col1;
      }
      lastRow = row;
    }
    return score;
  }

  static maskScoreRule3hor(modules, pattern = [true, false, true, true, true, false, true, false, false, false, false]) {
    const patternlen = pattern.length;
    let score = 0;
    for (const row of modules) {
      let j = 0;
      const maxj = row.length - patternlen;
      while (j < maxj) {
        if (arrayEquals(row.slice(j, j + patternlen), pattern)) {
          score += 40;
          j += patternlen;
        } else {
          j += 1;
        }
      }
    }
    return score;
  }

  static maskScoreRule4(modules) {
    const cellCount = modules.length ** 2;
    const count = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    return 10 * (Math.floor(Math.abs((100 * count) / cellCount - 50) / 5));
  }
}

function transpose(modules) {
  return modules[0].map((_, colIndex) => modules.map((row) => row[colIndex]));
}

function arrayEquals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function renderQrSvgDataUri(value, size = 220) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderQrSvgMarkup(value, size))}`;
}

export function renderQrSvgMarkup(value, size = 220) {
  const qr = new QRCode(null, QRErrorCorrectLevel.M);
  qr.addData(new QR8bitByte(value));
  qr.make();

  const quietZone = 4;
  const modules = qr.getModuleCount();
  const fullSize = modules + (quietZone * 2);
  const rects = [];

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      rects.push(`<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1"/>`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${fullSize} ${fullSize}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<g fill="#000000">`,
    rects.join(""),
    `</g>`,
    `</svg>`
  ].join("");
}
