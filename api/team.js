/* 팀 저장소 API. 팀 하나 = 문서 하나이고, 만들기·읽기·합류 셋뿐입니다.
   원점수는 받지 않습니다 — 클라이언트가 구간과 유형명까지 계산해서 보내고,
   서버는 팀에 보여줄 것만 저장합니다 (개인 원점수는 본인만 본다는 규칙).
   보관은 90일입니다. updatedAt 에 TTL 인덱스를 걸어 마지막 활동으로부터
   3개월이 지나면 몽고가 알아서 지웁니다. */
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

/* 서버리스 함수는 요청마다 새로 뜰 수 있어서, 연결을 모듈 변수에 붙잡아
   재사용합니다. 매번 connect 하면 Atlas 무료 티어의 동시 접속이 바닥납니다. */
let clientPromise = null;
async function teams() {
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI).connect().then(async (c) => {
      const col = c.db('oshiete').collection('teams');
      await col.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
      return col;
    });
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

const bad = (res, code, error) => res.status(code).json({ error });

/* 팀에 저장되는 멤버 모양. 이름이 키, 캐릭터는 0~3, 구간 다섯,
   유형명 문자열, 아이템은 [축, 극] 좌표(올라운더는 null). */
function packMember(m) {
  const ok = m && typeof m.name === 'string' && m.name.trim() && m.name.trim().length <= 12
    && Number.isInteger(m.char) && m.char >= 0 && m.char <= 3
    && Array.isArray(m.bands) && m.bands.length === 5 && m.bands.every((b) => b === 0 || b === 1 || b === 2)
    && typeof m.tname === 'string' && m.tname.length <= 30
    && (m.item === null || (Array.isArray(m.item) && m.item.length === 2
      && Number.isInteger(m.item[0]) && m.item[0] >= 0 && m.item[0] <= 4
      && (m.item[1] === 0 || m.item[1] === 1)));
  if (!ok) return null;
  return { name: m.name.trim(), char: m.char, bands: m.bands, tname: m.tname, item: m.item };
}

const ID_RE = /^[a-z0-9]{8}$/;
const newId = () => Array.from(crypto.randomBytes(8)).map((v) => (v % 36).toString(36)).join('');

module.exports = async (req, res) => {
  try {
    const col = await teams();

    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      if (!ID_RE.test(id)) return bad(res, 400, 'bad-id');
      const t = await col.findOne({ _id: id });
      if (!t) return bad(res, 404, 'not-found');
      return res.status(200).json({ id: t._id, team: t.team, members: t.members });
    }

    if (req.method !== 'POST') return bad(res, 405, 'method');
    const b = req.body || {};

    if (b.op === 'create') {
      const team = typeof b.team === 'string' ? b.team.trim() : '';
      if (!team || team.length > 20) return bad(res, 400, 'bad-team-name');
      const m = packMember(b.member);
      if (!m) return bad(res, 400, 'bad-member');
      const id = newId();
      const now = new Date();
      await col.insertOne({ _id: id, team, members: [m], createdAt: now, updatedAt: now });
      return res.status(200).json({ id });
    }

    if (b.op === 'join') {
      const id = String(b.id || '');
      if (!ID_RE.test(id)) return bad(res, 400, 'bad-id');
      const m = packMember(b.member);
      if (!m) return bad(res, 400, 'bad-member');
      const t = await col.findOne({ _id: id });
      if (!t) return bad(res, 404, 'not-found');
      const at = t.members.findIndex((x) => x.name === m.name);
      /* 같은 이름은 두 사람일 수 있어서 그냥 덮지 않는다. 클라이언트가
         [본인이면 갱신] 확인을 받고 overwrite 를 세워 다시 보낸다. */
      if (at >= 0 && !b.overwrite) return bad(res, 409, 'name-taken');
      if (at >= 0) t.members[at] = m;
      else if (t.members.length >= 4) return bad(res, 409, 'full');
      else t.members.push(m);
      await col.updateOne({ _id: id }, { $set: { members: t.members, updatedAt: new Date() } });
      return res.status(200).json({ id, team: t.team, members: t.members });
    }

    return bad(res, 400, 'bad-op');
  } catch (e) {
    console.error(e);
    return bad(res, 500, 'server');
  }
};
