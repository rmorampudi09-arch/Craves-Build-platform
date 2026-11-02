import type {SeenFace} from '../native/riderDevice';

export type FaceProblem = 'none' | 'many' | 'far' | 'turned' | 'eyes';

// Lenient on purpose: a rider wrongly refused can't go online. An arm's-length selfie is about a quarter of the photo wide.
const MIN_WIDTH = 0.18;
const MAX_ANGLE = 25;
const MIN_EYE_OPEN = 0.3;

/**
 * Why a selfie can't be used, or null when it shows one face, near enough, looking at the camera with eyes open (the
 * check Swiggy runs before a shift). Null faces means this phone couldn't check: the selfie goes as it is, and ops sees it.
 */
export function faceProblem(faces: SeenFace[] | null): FaceProblem | null {
  if (!faces) {
    return null;
  }
  const [face, ...others] = [...faces].sort((a, b) => b.widthRatio - a.widthRatio);
  if (!face) {
    return 'none';
  }
  // A passer-by far behind is fine; a second face at least half as wide is someone beside the rider.
  if (others.some(other => other.widthRatio * 2 >= face.widthRatio)) {
    return 'many';
  }
  if (face.widthRatio < MIN_WIDTH) {
    return 'far';
  }
  if (Math.abs(face.yaw) > MAX_ANGLE || Math.abs(face.roll) > MAX_ANGLE) {
    return 'turned';
  }
  // Both eyes shut: a blink or dark glasses. One eye in shadow, or a model that can't tell, passes.
  return Math.max(face.leftEye ?? 1, face.rightEye ?? 1) < MIN_EYE_OPEN ? 'eyes' : null;
}
