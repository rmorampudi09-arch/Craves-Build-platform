export {};

declare const __dirname: string;

const fs = jest.requireActual('fs') as {
  readFileSync(filePath: string, encoding: 'utf8'): string;
};
const path = jest.requireActual('path') as {
  resolve(...segments: string[]): string;
};

const mobileRoot = path.resolve(__dirname, '..');
const manifestPaths = [
  '../../api/apim-api/contracts/mobile-production.v1.json',
  '../../api/apim-api/contracts/mobile-subscriptions.v1.json',
  '../../api/apim-api/contracts/mobile-catalog-presentation.v1.json',
].map(relativePath => path.resolve(mobileRoot, relativePath));

interface MobileContractAction {
  id: string;
  source: string;
  method: string;
  path: string;
  auth: string;
  requestModel: string;
  responseModel: string;
  requestValidator: string;
  responseValidator: string;
}

interface MobileContractManifest {
  schemaVersion: number;
  phase: string;
  actions: MobileContractAction[];
}

function readManifest(filePath: string): MobileContractManifest {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as MobileContractManifest;
}

describe('mobile APIM contract manifest guards', () => {
  const manifests = manifestPaths.map(readManifest);
  const actions = manifests.flatMap(manifest => manifest.actions);

  it('keeps all mobile manifests on the P119 schema with production actions', () => {
    for (const manifest of manifests) {
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.phase).toBe('P119');
      expect(manifest.actions.length).toBeGreaterThan(0);
    }
    expect(actions).toHaveLength(91);
  });

  it('rejects synthetic, partial, or unresolved route placeholders', () => {
    for (const action of actions) {
      expect(action.path).toMatch(/^\/api\/v1\//);
      expect(action.path).not.toContain('/mobile-contract/');
      expect(action.path).not.toMatch(/[\r\n`$]|\$\{/);
      expect(action.path).not.toContain('{value}{value}');
      expect(action.path).toMatch(
        /^\/api\/v1\/[A-Za-z0-9/_{}.-]+(?:\?[A-Za-z0-9_&={}.:-]+)?$/,
      );
    }
  });

  it('keeps model and validator names deterministic from action ids', () => {
    for (const action of actions) {
      expect(action.requestModel).toBe(`${action.id}.request`);
      expect(action.responseModel).toBe(`${action.id}.response`);
      expect(action.requestValidator).toBe(`${action.id}.requestValidator`);
      expect(action.responseValidator).toBe(`${action.id}.responseValidator`);
    }
  });
});
