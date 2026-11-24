import { describe, expect, it } from 'vitest';
import { cameraConstraints, cameraErrorMessage, cameraUnavailableReason, facingFromLabel, pickCamera } from './camera';
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
  it('uses an exact camera id when one is chosen (tablets that ignore facingMode)', () => {
    const v = cameraConstraints('environment', 'cam-2').video as MediaTrackConstraints;
    expect(v.deviceId).toEqual({ exact: 'cam-2' });
    expect(v.facingMode).toBeUndefined();
  });
  it('reads camera direction from common labels (iPad, Android, Chinese)', () => {
    expect(facingFromLabel('Back Camera')).toBe('environment');
    expect(facingFromLabel('camera2 0, facing back')).toBe('environment');
    expect(facingFromLabel('後置相機')).toBe('environment');
    expect(facingFromLabel('Front Camera')).toBe('user');
    expect(facingFromLabel('FaceTime HD Camera')).toBe('user');
    expect(facingFromLabel('USB Camera')).toBeNull();
  });
  it('picks a camera for any device with two or more cameras, without checking device type', () => {
    const ipad = [{ deviceId: 'f', label: 'Front Camera' }, { deviceId: 'b', label: 'Back Camera' }, { deviceId: 'u', label: 'Back Ultra Wide Camera' }];
    expect(pickCamera(ipad, 'environment', 'f')?.deviceId).toBe('b');
    expect(pickCamera(ipad, 'user', 'b')?.deviceId).toBe('f');
    const unlabeled = [{ deviceId: 'a', label: '' }, { deviceId: 'z', label: '' }];
    expect(pickCamera(unlabeled, 'environment', 'a')?.deviceId).toBe('z');
    expect(pickCamera([{ deviceId: 'a', label: '' }], 'environment', 'a')).toBeNull();
  });
});
