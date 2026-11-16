export function App() {
  return (
    <main>
      <p className="eyebrow">NTU · 115-1 · 醫學創意整合專題</p>
      <h1>關節動作分析研究工作台</h1>
      <p>Real-Time Joint Motion Analysis System</p>
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">目前進度：專案初始化</h2>
        <p>已建立開發骨架與研究規範。影片分析、攝影機、骨架辨識與角度曲線尚未實作。</p>
        <h3>下一階段：Dataset Demo V0.1</h3>
        <p>預計從側面深蹲影片開始，逐步完成骨架、膝部幾何角度、時間曲線與 CSV 匯出。</p>
      </section>
      <aside aria-label="研究用途說明">
        本系統為學術概念驗證，僅輔助運動評估與溝通，不提供醫療診斷或治療建議。
        未來姿態模型的估計值須經驗證，不能直接視為臨床角度或真實參考值。
      </aside>
    </main>
  );
}
