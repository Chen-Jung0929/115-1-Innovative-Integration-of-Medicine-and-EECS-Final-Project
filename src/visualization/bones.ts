// Anatomical bone meshes (OpenSim LaiUhlrich2022 geometry via opencap-viewer, Apache-2.0; see
// public/bones/) posed from MediaPipe world landmarks. Display only (ADR-070). Segments are
// pre-aligned: proximal joint at the origin, distal joint at (0, -L, 0), X anterior, Y up, Z right.
import * as THREE from 'three';

const unit = (v: THREE.Vector3) => v.clone().normalize();

function basis(y: THREE.Vector3, zRef: THREE.Vector3): THREE.Quaternion {
  const Y = unit(y);
  const Z = zRef.clone().sub(Y.clone().multiplyScalar(Y.dot(zRef))).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

/** Lateral axis of a hinge from the limb plane, falling back to the body axis when the limb is straight. */
function hingeAxis(prox: THREE.Vector3, mid: THREE.Vector3, dist: THREE.Vector3, bodyRight: THREE.Vector3): THREE.Vector3 {
  const a = prox.clone().sub(mid), b = dist.clone().sub(mid);
  const n = new THREE.Vector3().crossVectors(a, b);
  const sin = n.length() / (a.length() * b.length() + 1e-9);
  if (n.dot(bodyRight) < 0) n.negate();
  const w = Math.min(1, Math.max(0, (sin - 0.15) / 0.25));
  return bodyRight.clone().multiplyScalar(1 - w).add(n.normalize().multiplyScalar(w)).normalize();
}

export interface Bones { group: THREE.Group; update(P: THREE.Vector3[]): void }

export async function createBones(scene: THREE.Scene, baseUrl: string): Promise<Bones> {
  const [meta, bin] = await Promise.all([
    fetch(`${baseUrl}bones.json`).then(r => { if (!r.ok) throw new Error('bones.json'); return r.json() as Promise<Record<string, { L: number; v: [number, number]; f: [number, number] }>>; }),
    fetch(`${baseUrl}bones.bin`).then(r => { if (!r.ok) throw new Error('bones.bin'); return r.arrayBuffer(); }),
  ]);
  const group = new THREE.Group();
  const seg: Record<string, { mesh: THREE.Mesh; L: number }> = {};
  for (const [name, m] of Object.entries(meta)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, m.v[0], m.v[1] * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, m.f[0], m.f[1] * 3), 1));
    g.computeVertexNormals();
    const side = name.endsWith('_l') ? 0x9cc3f5 : name.endsWith('_r') ? 0xf5c09c : 0xece4d4;
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: side, roughness: 0.55 }));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    seg[name] = { mesh, L: m.L };
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.55 }));
  group.add(head);
  scene.add(group);
  const place = (name: string, pos: THREE.Vector3, q: THREE.Quaternion, s: number) => seg[name]?.mesh.matrix.compose(pos, q, new THREE.Vector3(s, s, s));
  const limb = (name: string, prox: THREE.Vector3, dist: THREE.Vector3, zRef: THREE.Vector3) => {
    const s = prox.distanceTo(dist) / (seg[name]?.L ?? 1);
    place(name, prox, basis(prox.clone().sub(dist), zRef), s);
    return s;
  };
  function update(P: THREE.Vector3[]) {
    const p = (i: number) => P[i]!;
    const up = new THREE.Vector3(0, 1, 0);
    const right = unit(p(24).clone().sub(p(23)));
    const shRight = unit(p(12).clone().sub(p(11)));
    const midHip = p(23).clone().add(p(24)).multiplyScalar(0.5);
    const midSh = p(11).clone().add(p(12)).multiplyScalar(0.5);
    // MediaPipe hip points sit wider than the joint centres, so size the pelvis from thigh length.
    const thighScale = (p(24).distanceTo(p(26)) / (seg.femur_r?.L ?? 1) + p(23).distanceTo(p(25)) / (seg.femur_l?.L ?? 1)) / 2;
    place('pelvis', midHip, basis(up, right), thighScale);
    limb('torso', midSh, midHip, shRight);
    for (const [s, hip, knee, ank, heel, toe, sh, el, wr] of [['r', 24, 26, 28, 30, 32, 12, 14, 16], ['l', 23, 25, 27, 29, 31, 11, 13, 15]] as const) {
      const legAxis = hingeAxis(p(hip), p(knee), p(ank), right);
      limb(`femur_${s}`, p(hip), p(knee), legAxis);
      const shin = limb(`tibia_${s}`, p(knee), p(ank), legAxis);
      const fwd = unit(p(toe).clone().sub(p(heel)));
      const footRight = new THREE.Vector3().crossVectors(fwd, up).normalize();
      const footUp = new THREE.Vector3().crossVectors(footRight, fwd);
      place(`foot_${s}`, p(ank), basis(footUp, footRight), shin);
      const armAxis = hingeAxis(p(sh), p(el), p(wr), shRight);
      limb(`humerus_${s}`, p(sh), p(el), armAxis);
      limb(`forearm_${s}`, p(el), p(wr), armAxis);
    }
    head.position.copy(midSh).add(new THREE.Vector3(0, 0.2, 0)).lerp(p(0), 0.5);
  }
  return { group, update };
}
