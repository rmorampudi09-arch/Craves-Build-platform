import React from 'react';
import {Linking} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {EMPTY_ONBOARDING, type OnboardingState} from '../../chefOnboarding/api/chefOnboardingApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {ChefBusinessInformationScreen} from './ChefBusinessInformationScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
const mockOnboarding = {load: jest.fn(), preview: jest.fn(), upload: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
let mockAccountApproved = true;
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({
      auth: {
        identity: {id: 'user-1'},
        accountResolution: {flow: 'CHEF', onboardingStatus: mockAccountApproved ? 'APPROVED' : 'PENDING'},
      },
    }),
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  ...jest.requireActual('../../chefOnboarding/api/chefOnboardingApi'),
  chefOnboardingApi: {
    load: (...args: unknown[]) => mockOnboarding.load(...args),
    preview: (...args: unknown[]) => mockOnboarding.preview(...args),
    upload: (...args: unknown[]) => mockOnboarding.upload(...args),
  },
}));

const doc = (documentType: string, status: 'UPLOADED' | 'APPROVED' | 'REJECTED' = 'APPROVED', reviewReason: string | null = null) => ({
  id: `id-${documentType}`,
  documentType,
  originalFileName: 'photo.jpg',
  fileSizeBytes: 1000,
  status,
  reviewReason,
});
const application = (status: OnboardingState['application']['status'], extra = {}) => ({
  id: 'a1',
  status,
  rejectionReason: null,
  submittedAt: '2026-08-10T10:00:00Z',
  reviewedAt: '2026-08-13T10:00:00Z',
  referenceCode: null,
  ...extra,
});
const onboarding = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  enabled: true,
  legacy: false,
  version: 3,
  submitted: true,
  bankEnrollmentRequired: false,
  phoneNumber: '+919876543210',
  details: {...EMPTY_ONBOARDING, proofKind: 'AADHAAR', fssaiNumber: '12345678901234'},
  application: application('APPROVED'),
  documents: [doc('SELECTED_PROOF_FRONT'), doc('SELECTED_PROOF_BACK'), doc('KITCHEN_PHOTO_1')],
  supportPhone: '+918012345678',
  supportEmail: 'help@craves.in',
  progress: {status: 'APPROVED', reason: null, nextAction: '', fssaiVerified: true, termsVersion: 'v1', sections: []},
  callbackRequest: null,
  ...overrides,
});

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefBusinessInformationScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefBusinessInformationScreen (Documents & verification)', () => {
  let openUrl: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockAccountApproved = true;
    mockOnboarding.load.mockResolvedValue(onboarding());
  });
  afterEach(() => {
    openUrl.mockRestore();
    act(() => tree.unmount());
  });

  it('says the kitchen is verified and lists each document with its own status', async () => {
    await mount();
    expect(ui.has('Your kitchen is verified')).toBe(true);
    expect(ui.has('Approved by Craves on 13 Aug 2026')).toBe(true);
    expect(ui.byPrefix('Aadhaar card · front')).toBeDefined();
    expect(ui.byPrefix('Aadhaar card · back')).toBeDefined();
    expect(ui.byPrefix('Kitchen photo')).toBeDefined();
    expect(ui.has('FSSAI registration')).toBe(true);
    expect(ui.has('1234 5678 9012 34')).toBe(true);
    expect(ui.lines().filter(line => line === 'Approved').length).toBeGreaterThanOrEqual(4);
    expect(ui.anyText(/SELECTED_PROOF|KITCHEN_PHOTO|APPROVED|contract|route/)).toBe(false);
    expect(ui.anyText(/To change an approved document, contact support/)).toBe(true);
  });

  it('shows what is wrong with a document Craves sent back, and that the application is not approved yet', async () => {
    mockOnboarding.load.mockResolvedValue(
      onboarding({
        application: application('REJECTED', {rejectionReason: 'The ID is not readable.', reviewedAt: '2026-08-13T10:00:00Z'}),
        documents: [doc('SELECTED_PROOF_FRONT', 'REJECTED', 'The photo is blurred.')],
      }),
    );
    await mount();
    expect(ui.has('Your documents need an update')).toBe(true);
    expect(ui.has('The ID is not readable.')).toBe(true);
    expect(ui.has('Needs update')).toBe(true);
    expect(ui.has('The photo is blurred.')).toBe(true);
  });

  it('opens a document from its row', async () => {
    mockOnboarding.preview.mockResolvedValue('https://files.example.test/front.jpg?sig=1');
    await mount();
    await ui.press('Aadhaar card · front');
    await ui.settle();
    expect(mockOnboarding.preview).toHaveBeenCalledWith('id-SELECTED_PROOF_FRONT');
    expect(openUrl).toHaveBeenCalledWith('https://files.example.test/front.jpg?sig=1');
  });

  it('says so, plainly, when a document cannot be opened', async () => {
    mockOnboarding.preview.mockRejectedValue(new Error('network'));
    await mount();
    await ui.press('Aadhaar card · front');
    await ui.settle();
    expect(openUrl).not.toHaveBeenCalled();
    expect(ui.has("We couldn't open that file. Please try again.")).toBe(true);
  });

  it('shows the documents to view only: there is no upload', async () => {
    await mount();
    expect(ui.anyText(/Upload/)).toBe(false);
    expect(mockOnboarding.upload).not.toHaveBeenCalled();
  });

  it('asks support to update a document', async () => {
    await mount();
    await ui.press('Ask to update a document');
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {topic: 'Update a document'});
  });

  it('tells a chef approved before the new application that support handles their documents, and opens a ticket', async () => {
    // GET /chef/onboarding answers 404: this chef has no application of the new kind.
    mockOnboarding.load.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('Your documents were checked when you joined. To update them, contact support.')).toBe(true);
    expect(ui.anyText(/Coming soon|on their way|not finished|Upload another document/i)).toBe(false);
    await ui.press('Contact support');
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {topic: 'Update my documents'});
  });

  it('does not say documents were checked when the chef is not approved: a 404 there means the application is not finished', async () => {
    mockAccountApproved = false;
    mockOnboarding.load.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('Your application is not finished')).toBe(true);
    expect(ui.anyText(/checked when you joined/)).toBe(false);
    expect(ui.byLabel('Contact support')).toBeUndefined();
  });

  it('says the same for an approved chef whose application is empty', async () => {
    mockOnboarding.load.mockResolvedValue(
      onboarding({application: application('NOT_SUBMITTED', {reviewedAt: null, submittedAt: null}), documents: [], details: null}),
    );
    await mount();
    expect(ui.has('Your documents were checked when you joined. To update them, contact support.')).toBe(true);
    expect(ui.anyText(/not finished/i)).toBe(false);
  });

  it('still says the application is not finished for a chef who is not approved', async () => {
    mockAccountApproved = false;
    mockOnboarding.load.mockResolvedValue(
      onboarding({application: application('NOT_SUBMITTED', {reviewedAt: null, submittedAt: null}), documents: []}),
    );
    await mount();
    expect(ui.has('Your application is not finished')).toBe(true);
  });

  it('shows a retry card, not Coming soon, when the documents cannot be loaded', async () => {
    mockOnboarding.load.mockRejectedValue(new AppApiError('HTTP_500', 'Server error', 500));
    await mount();
    expect(ui.has("We couldn't load this")).toBe(true);
    expect(ui.anyText(/Coming soon/)).toBe(false);
  });
});
