/* Carrega a base binária com 1 bloco base (20 B) + 4 blocos de imputação (9 B cada). */
const BASE_ROW = 20;
const VAR_ROW = 9;
const N_IMPUTACOES = 5;

function makeDataset(base, variant) {
  return {
    ...base,
    height: variant.height,
    bmi: variant.bmi,
    smoke: variant.smoke,
    kids: variant.kids,
    car: variant.car,
    income: variant.income,
    n: base.n,
    ufIndex: base.ufIndex,
  };
}

export async function loadData() {
  const [metaRes, binRes] = await Promise.all([
    fetch("data/meta.json"),
    fetch("data/population.bin"),
  ]);
  if (!metaRes.ok || !binRes.ok) {
    throw new Error("Não foi possível carregar a base. Rode `python3 serve.py` na raiz do projeto.");
  }
  const meta = await metaRes.json();
  const buf = await binRes.arrayBuffer();
  const rowBytes = BASE_ROW + (N_IMPUTACOES - 1) * VAR_ROW;
  if (buf.byteLength % rowBytes !== 0) throw new Error("Arquivo population.bin corrompido.");
  const n = buf.byteLength / rowBytes;
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);

  const base = {
    n,
    uf: new Uint8Array(n), sex: new Uint8Array(n), band: new Uint8Array(n),
    race: new Uint8Array(n), edu: new Uint8Array(n), marital: new Uint8Array(n),
    kids: new Uint8Array(n), smoke: new Uint8Array(n), bmi: new Uint8Array(n),
    car: new Uint8Array(n), home: new Uint8Array(n), height: new Uint8Array(n),
    income: new Float32Array(n), weight: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    const o = i * BASE_ROW;
    base.uf[i] = u8[o];
    base.sex[i] = u8[o + 1];
    base.band[i] = u8[o + 2];
    base.race[i] = u8[o + 3];
    base.edu[i] = u8[o + 4];
    base.marital[i] = u8[o + 5];
    base.kids[i] = u8[o + 6];
    base.smoke[i] = u8[o + 7];
    base.bmi[i] = u8[o + 8];
    base.car[i] = u8[o + 9];
    base.home[i] = u8[o + 10];
    base.height[i] = u8[o + 11];
    base.income[i] = dv.getFloat32(o + 12, true);
    base.weight[i] = dv.getFloat32(o + 16, true);
  }
  base.ufIndex = new Map(meta.ufs.map((u, i) => [u.codigo, i]));
  base.ufName = meta.ufs.map((u) => u.nome);
  base.ufCode = meta.ufs.map((u) => u.codigo);
  base.meta = meta;

  const datasets = [base];
  const firstVar = BASE_ROW * n;
  for (let m = 1; m < N_IMPUTACOES; m++) {
    const off = firstVar + (m - 1) * VAR_ROW * n;
    const v = {
      height: new Uint8Array(n), bmi: new Uint8Array(n), smoke: new Uint8Array(n),
      kids: new Uint8Array(n), car: new Uint8Array(n), income: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const o = off + i * VAR_ROW;
      v.height[i] = u8[o];
      v.bmi[i] = u8[o + 1];
      v.smoke[i] = u8[o + 2];
      v.kids[i] = u8[o + 3];
      v.car[i] = u8[o + 4];
      v.income[i] = dv.getFloat32(o + 5, true);
    }
    datasets.push(makeDataset(base, v));
  }

  return { ...base, datasets };
}
