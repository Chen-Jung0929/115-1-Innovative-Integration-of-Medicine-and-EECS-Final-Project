# biomechanics

knee.ts：純函式像素幾何、共用 landmark 篩檢（sourcePoint／sourcePoints）、左右膝 mapping 與 provisional proxy。

posture.ts：深蹲姿勢指標（髖角、上身（軀幹）前傾、兩膝距離 ÷ 兩踝距離），皆為 2D 影像平面暫定定義；gating 在 tracking/gate.ts。

研究與實測限制見 docs/ARCHITECTURE.md 及 docs/updates/iteration-01-dataset-demo.md。
