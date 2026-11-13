// ゲームの調整値。遊びながらここの数字を変えて手ざわりを詰める。
const CFG = {
  // 画面（内部解像度。実際の表示はウィンドウに合わせて拡大縮小する）
  W: 1280, H: 720,

  // ステージ
  STAGE_R: 320,        // ステージ半径
  STAGE_CX: 640,       // 画面上の中心
  STAGE_CY: 350,
  TILT: 0.5,           // 斜め見下ろしのつぶし率（1で真上、小さいほど横から）
  PLAYER_R: 30,        // キャラの当たり判定の半径

  // 試合
  STOCKS: 3,           // のこり回数
  MATCH_TIME: 90,      // 制限時間（秒）
  FILL_CPU: 4,         // この人数になるまでCPUで埋める
  RESPAWN_INV: 2,      // 復帰後の無敵時間（秒）

  // 移動
  ACCEL: 1500,         // 加速
  DAMP: 6,             // ふつうの減速（大きいほどすぐ止まる）
  DAMP_HIT: 2.5,       // 吹っ飛び中の減速（小さいほどよく飛ぶ）

  // 体当たり（_C が付く値は、最大までためたときの上乗せ分）
  CHARGE_TIME: 0.8,    // 最大までためるのにかかる時間
  CHARGE_MOVE: 0.35,   // ため中の移動の速さ（通常比）
  CHARGE_MAX_HOLD: 1.6,// これ以上ためると勝手に発射
  DASH_SPEED: 560, DASH_SPEED_C: 240,
  DASH_TIME: 0.2,  DASH_TIME_C: 0.1,
  RECOVER: 0.25,   RECOVER_C: 0.3,   // 攻撃後のすき

  // ダメージと吹っ飛び
  //   吹っ飛び速度 = (KB_BASE + ％ × KB_PCT) × (KB_MUL + KB_MUL_C × ため具合)
  DMG: 8, DMG_C: 12,
  KB_BASE: 260, KB_PCT: 6,
  KB_MUL: 0.8, KB_MUL_C: 0.9,
  HITSTUN: 0.3, HITSTUN_KB: 1 / 2000, HITSTUN_MAX: 1.2, // 操作できない時間

  // ガード
  SHIELD_TIME: 1.5,    // 張りっぱなしで割れるまでの時間
  SHIELD_REGEN: 3,     // 全回復にかかる時間
  SHIELD_HIT: 0.35,    // 攻撃を受けたときに減る量（1が満タン）
  GUARD_BREAK: 1.2,    // 割れたあと動けない時間
};

// プレイヤーごとの色（胴体・足もとの輪・表示パネルで共通）
const PLAYER_COLORS = [
  { main: '#ff4d5a', dark: '#a81a2b', light: '#ffc2c7' }, // 赤
  { main: '#3d8bff', dark: '#1647a8', light: '#c2dcff' }, // 青
  { main: '#ffc928', dark: '#a87400', light: '#fff0b8' }, // 黄
  { main: '#3fcf6a', dark: '#14803a', light: '#c4f5d2' }, // 緑
];
