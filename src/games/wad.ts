// WAD file parser for DOOM
// Reads DOOM1.WAD and extracts level data, palettes, textures

export interface WadLump {
  name: string;
  offset: number;
  size: number;
  data: Uint8Array;
}

export interface WadFile {
  type: 'IWAD' | 'PWAD';
  lumps: WadLump[];
  lumpMap: Map<string, WadLump>;
}

export function parseWad(buffer: ArrayBuffer): WadFile {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header: 4-byte ID, 4-byte numlumps, 4-byte infotableofs
  const id = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (id !== 'IWAD' && id !== 'PWAD') throw new Error(`Invalid WAD: ${id}`);

  const numLumps = view.getInt32(4, true);
  const infoTableOfs = view.getInt32(8, true);

  const lumps: WadLump[] = [];
  const lumpMap = new Map<string, WadLump>();

  for (let i = 0; i < numLumps; i++) {
    const entryOfs = infoTableOfs + i * 16;
    const filepos = view.getInt32(entryOfs, true);
    const size = view.getInt32(entryOfs + 4, true);
    let name = '';
    for (let j = 0; j < 8; j++) {
      const ch = view.getUint8(entryOfs + 8 + j);
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }

    const data = bytes.slice(filepos, filepos + size);
    const lump: WadLump = { name, offset: filepos, size, data };
    lumps.push(lump);
    lumpMap.set(name, lump);
  }

  return { type: id as 'IWAD' | 'PWAD', lumps, lumpMap };
}

// DOOM level data structures
export interface Vertex {
  x: number; // fixed-point 16.16
  y: number;
}

export interface Linedef {
  v1: number; // vertex index
  v2: number;
  flags: number;
  special: number;
  tag: number;
  sidenum: [number, number]; // front/back sidedef (-1 = none)
}

export interface Sidedef {
  xOffset: number;
  yOffset: number;
  upperTexture: string;
  lowerTexture: string;
  midTexture: string;
  sector: number;
}

export interface Sector {
  floorHeight: number;
  ceilHeight: number;
  floorPic: string;
  ceilPic: string;
  lightLevel: number;
  special: number;
  tag: number;
}

export interface Seg {
  v1: number;
  v2: number;
  angle: number;
  linedef: number;
  direction: number;
  offset: number;
}

export interface SubSector {
  numSegs: number;
  firstSeg: number;
}

export interface BspNode {
  x: number;
  y: number;
  dx: number;
  dy: number;
  bbox: [[number, number, number, number], [number, number, number, number]]; // right, left
  children: [number, number]; // right, left (high bit = subsector flag)
}

export interface Thing {
  x: number;
  y: number;
  angle: number;
  type: number;
  flags: number;
}

export interface DoomLevel {
  name: string;
  vertexes: Vertex[];
  linedefs: Linedef[];
  sidedefs: Sidedef[];
  sectors: Sector[];
  segs: Seg[];
  subsectors: SubSector[];
  nodes: BspNode[];
  things: Thing[];
}

export function loadLevel(wad: WadFile, levelName: string): DoomLevel {
  // Find the level marker (e.g. "E1M1" or "MAP01")
  const levelIdx = wad.lumps.findIndex(l => l.name === levelName);
  if (levelIdx === -1) throw new Error(`Level not found: ${levelName}`);

  // Level lumps follow the marker in a fixed order
  function getLump(name: string): WadLump {
    for (let i = levelIdx + 1; i < Math.min(levelIdx + 12, wad.lumps.length); i++) {
      if (wad.lumps[i].name === name) return wad.lumps[i];
    }
    throw new Error(`Lump ${name} not found for level ${levelName}`);
  }

  // Parse VERTEXES
  const vertLump = getLump('VERTEXES');
  const vertView = new DataView(vertLump.data.buffer, vertLump.data.byteOffset, vertLump.data.byteLength);
  const vertexes: Vertex[] = [];
  for (let i = 0; i < vertLump.size / 4; i++) {
    vertexes.push({
      x: vertView.getInt16(i * 4, true) << 16, // convert to 16.16 fixed
      y: vertView.getInt16(i * 4 + 2, true) << 16,
    });
  }

  // Parse LINEDEFS
  const lineLump = getLump('LINEDEFS');
  const lineView = new DataView(lineLump.data.buffer, lineLump.data.byteOffset, lineLump.data.byteLength);
  const linedefs: Linedef[] = [];
  for (let i = 0; i < lineLump.size / 14; i++) {
    const ofs = i * 14;
    linedefs.push({
      v1: lineView.getUint16(ofs, true),
      v2: lineView.getUint16(ofs + 2, true),
      flags: lineView.getUint16(ofs + 4, true),
      special: lineView.getUint16(ofs + 6, true),
      tag: lineView.getUint16(ofs + 8, true),
      sidenum: [lineView.getInt16(ofs + 10, true), lineView.getInt16(ofs + 12, true)],
    });
  }

  // Parse SIDEDEFS
  const sideLump = getLump('SIDEDEFS');
  const sideView = new DataView(sideLump.data.buffer, sideLump.data.byteOffset, sideLump.data.byteLength);
  const sidedefs: Sidedef[] = [];
  for (let i = 0; i < sideLump.size / 30; i++) {
    const ofs = i * 30;
    const readStr = (o: number) => {
      let s = '';
      for (let j = 0; j < 8; j++) {
        const ch = sideView.getUint8(ofs + o + j);
        if (ch === 0) break;
        s += String.fromCharCode(ch);
      }
      return s;
    };
    sidedefs.push({
      xOffset: sideView.getInt16(ofs, true),
      yOffset: sideView.getInt16(ofs + 2, true),
      upperTexture: readStr(4),
      lowerTexture: readStr(12),
      midTexture: readStr(20),
      sector: sideView.getUint16(ofs + 28, true),
    });
  }

  // Parse SECTORS
  const secLump = getLump('SECTORS');
  const secView = new DataView(secLump.data.buffer, secLump.data.byteOffset, secLump.data.byteLength);
  const sectors: Sector[] = [];
  for (let i = 0; i < secLump.size / 26; i++) {
    const ofs = i * 26;
    const readStr = (o: number) => {
      let s = '';
      for (let j = 0; j < 8; j++) {
        const ch = secView.getUint8(ofs + o + j);
        if (ch === 0) break;
        s += String.fromCharCode(ch);
      }
      return s;
    };
    sectors.push({
      floorHeight: secView.getInt16(ofs, true),
      ceilHeight: secView.getInt16(ofs + 2, true),
      floorPic: readStr(4),
      ceilPic: readStr(12),
      lightLevel: secView.getUint16(ofs + 20, true),
      special: secView.getUint16(ofs + 22, true),
      tag: secView.getUint16(ofs + 24, true),
    });
  }

  // Parse SEGS
  const segLump = getLump('SEGS');
  const segView = new DataView(segLump.data.buffer, segLump.data.byteOffset, segLump.data.byteLength);
  const segs: Seg[] = [];
  for (let i = 0; i < segLump.size / 12; i++) {
    const ofs = i * 12;
    segs.push({
      v1: segView.getUint16(ofs, true),
      v2: segView.getUint16(ofs + 2, true),
      angle: segView.getInt16(ofs + 4, true),
      linedef: segView.getUint16(ofs + 6, true),
      direction: segView.getUint16(ofs + 8, true),
      offset: segView.getUint16(ofs + 10, true),
    });
  }

  // Parse SSECTORS
  const ssLump = getLump('SSECTORS');
  const ssView = new DataView(ssLump.data.buffer, ssLump.data.byteOffset, ssLump.data.byteLength);
  const subsectors: SubSector[] = [];
  for (let i = 0; i < ssLump.size / 4; i++) {
    const ofs = i * 4;
    subsectors.push({
      numSegs: ssView.getUint16(ofs, true),
      firstSeg: ssView.getUint16(ofs + 2, true),
    });
  }

  // Parse NODES
  const nodeLump = getLump('NODES');
  const nodeView = new DataView(nodeLump.data.buffer, nodeLump.data.byteOffset, nodeLump.data.byteLength);
  const nodes: BspNode[] = [];
  for (let i = 0; i < nodeLump.size / 28; i++) {
    const ofs = i * 28;
    nodes.push({
      x: nodeView.getInt16(ofs, true),
      y: nodeView.getInt16(ofs + 2, true),
      dx: nodeView.getInt16(ofs + 4, true),
      dy: nodeView.getInt16(ofs + 6, true),
      bbox: [
        [nodeView.getInt16(ofs + 8, true), nodeView.getInt16(ofs + 10, true),
         nodeView.getInt16(ofs + 12, true), nodeView.getInt16(ofs + 14, true)],
        [nodeView.getInt16(ofs + 16, true), nodeView.getInt16(ofs + 18, true),
         nodeView.getInt16(ofs + 20, true), nodeView.getInt16(ofs + 22, true)],
      ],
      children: [nodeView.getUint16(ofs + 24, true), nodeView.getUint16(ofs + 26, true)],
    });
  }

  // Parse THINGS
  const thingLump = getLump('THINGS');
  const thingView = new DataView(thingLump.data.buffer, thingLump.data.byteOffset, thingLump.data.byteLength);
  const things: Thing[] = [];
  for (let i = 0; i < thingLump.size / 10; i++) {
    const ofs = i * 10;
    things.push({
      x: thingView.getInt16(ofs, true),
      y: thingView.getInt16(ofs + 2, true),
      angle: thingView.getUint16(ofs + 4, true),
      type: thingView.getUint16(ofs + 6, true),
      flags: thingView.getUint16(ofs + 8, true),
    });
  }

  return { name: levelName, vertexes, linedefs, sidedefs, sectors, segs, subsectors, nodes, things };
}

// Extract PLAYPAL (color palette) from WAD
export function loadPalette(wad: WadFile): Uint32Array {
  const lump = wad.lumpMap.get('PLAYPAL');
  if (!lump) throw new Error('PLAYPAL not found');

  // First palette is 768 bytes (256 * 3 RGB)
  const pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = lump.data[i * 3];
    const g = lump.data[i * 3 + 1];
    const b = lump.data[i * 3 + 2];
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r; // ABGR for canvas
  }
  return pal;
}

// Extract COLORMAP for distance shading
export function loadColormap(wad: WadFile): Uint8Array {
  const lump = wad.lumpMap.get('COLORMAP');
  if (!lump) throw new Error('COLORMAP not found');
  return lump.data; // 34 * 256 bytes (34 light levels, 256 color mappings each)
}
