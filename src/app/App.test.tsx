import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';

describe('initialization screen', () => {
  it('renders the project status and explicitly marks analysis as unimplemented', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('專案初始化');
    expect(html).toContain('尚未實作');
    expect(html).toContain('Dataset Demo V0.1');
  });
  it('shows the research limitation without activating capture or upload', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('不提供醫療診斷或治療建議');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('type="file"');
  });
});
