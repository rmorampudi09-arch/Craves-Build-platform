import {faceProblem} from './selfieFace';

const face = {widthRatio: 0.35, yaw: 4, roll: -3, leftEye: 0.95, rightEye: 0.9};

describe('the selfie face check', () => {
  it('passes one face, near enough, looking at the camera with eyes open', () => {
    expect(faceProblem([face])).toBeNull();
    // At arm's length, slightly turned, glasses the model can't read: still fine.
    expect(faceProblem([{widthRatio: 0.2, yaw: -20, roll: 18}])).toBeNull();
  });

  it('lets the selfie through when this phone could not check', () => {
    expect(faceProblem(null)).toBeNull();
  });

  it('asks again with no face, a second person, or a face too far away', () => {
    expect(faceProblem([])).toBe('none');
    expect(faceProblem([face, {...face, widthRatio: 0.2}])).toBe('many');
    // A passer-by far behind doesn't count.
    expect(faceProblem([face, {...face, widthRatio: 0.1}])).toBeNull();
    expect(faceProblem([{...face, widthRatio: 0.12}])).toBe('far');
  });

  it('asks again with the head turned or tilted, or both eyes shut', () => {
    expect(faceProblem([{...face, yaw: 40}])).toBe('turned');
    expect(faceProblem([{...face, roll: -30}])).toBe('turned');
    expect(faceProblem([{...face, leftEye: 0.1, rightEye: 0.05}])).toBe('eyes');
    // One eye in shadow passes.
    expect(faceProblem([{...face, leftEye: 0.1}])).toBeNull();
  });
});
