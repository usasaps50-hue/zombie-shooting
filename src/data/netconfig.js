// ============================================================
//  オンラインで一緒に遊ぶための設定（Supabase）
//
//  下の2つに、自分の Supabase プロジェクトの値を貼りつけてください。
//  貼るまではオフライン（ひとり用）のまま遊べます。
//  手順は README.md の「オンラインで一緒に遊ぶ」を見てください。
// ============================================================

// 例: 'https://abcdefghijklm.supabase.co'
export const SUPABASE_URL = 'https://ryjhxcekqncpgyrwlyxc.supabase.co';

// 「Publishable key」または「anon public」キー。
// これはブラウザに置いて公開してよいキーです（秘密のキーではありません）。
// service_role / secret のキーは絶対に貼らないでください。
export const SUPABASE_KEY = 'sb_publishable_FprbXQ0YVbZ4TKluYLSVOQ_L1K4z264';

export const NET = {
  // 1秒あたり何回、自分の位置を送るか
  playerHz: 12,
  // 1秒あたり何回、親がゾンビと建物の状態を送るか
  worldHz: 10,
  // 1部屋の人数の上限。増やすと1秒あたりのメッセージ数も増える
  maxPlayers: 8,
  // 受け取った位置になじませる速さ（大きいほどキビキビ、小さいほどなめらか）
  lerpSpeed: 14,
  // これだけ音沙汰がない相手は、切れたとみなして消す（秒）
  timeout: 8,
};

// 人数が増えるほど1人あたりの送信を減らして、無料枠（100メッセージ/秒）に収める
export function playerHz(playerCount) {
  if (playerCount <= 4) return NET.playerHz;
  if (playerCount <= 6) return 9;
  return 6;
}

export function netReady() {
  return SUPABASE_URL.startsWith('http') && SUPABASE_KEY.length > 20;
}
