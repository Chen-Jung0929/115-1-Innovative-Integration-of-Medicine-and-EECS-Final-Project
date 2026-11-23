import { describe, expect, it } from 'vitest';
import { cameraConstraints, cameraErrorMessage, cameraUnavailableReason } from './camera';
describe('camera input adapter', () => {
  it('requests video only, with ideal (not exact) facing so laptops without a rear camera still work', () => {
    const c = cameraConstraints('environment');
    expect(c.audio).toBe(false);
    expect((c.video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' });
  });
  it('explains insecure origins before anything else', () => {
    expect(cameraUnavailableReason({ isSecureContext: false, hasMediaDevices: true, hasFrameCallback: true })).toContain('https');
    expect(cameraUnavailableReason({ isSecureContext: true, hasMediaDevices: false, hasFrameCallback: true })).toContain('不支援鏡頭');
    expect(cameraUnavailableReason({ isSecureContext: true, hasMediaDevices: true, hasFrameCallback: true })).toBeNull();
  });
  it('maps browser permission and device errors to plain messages', () => {
    expect(cameraErrorMessage(new DOMException('x', 'NotAllowedError'))).toContain('權限');
    expect(cameraErrorMessage(new DOMException('x', 'NotFoundError'))).toContain('找不到');
    expect(cameraErrorMessage(new DOMException('x', 'NotReadableError'))).toContain('其他程式');
    expect(cameraErrorMessage(new Error('boom'))).toContain('boom');
  });
});
