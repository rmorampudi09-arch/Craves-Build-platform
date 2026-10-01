import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '../../../app/store/hooks';
import {
  useChefReferralCode,
  useChefReferralEarnings,
} from './useChefReferralData';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../../app/store/hooks', () => ({ useAppSelector: jest.fn() }));

describe('chef referral queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAppSelector).mockReturnValue('member-one');
  });
  it('does not call unpublished endpoints even for a signed-in chef', () => {
    useChefReferralCode();
    useChefReferralEarnings();
    for (const [options] of jest.mocked(useQuery).mock.calls)
      expect(options.enabled).toBe(false);
  });
  it('isolates cached codes and financial data by identity', () => {
    useChefReferralCode();
    useChefReferralEarnings();
    jest.mocked(useAppSelector).mockReturnValue('member-two');
    useChefReferralCode();
    useChefReferralEarnings();
    const keys = jest
      .mocked(useQuery)
      .mock.calls.map(([options]) => options.queryKey);
    expect(keys[0]).not.toEqual(keys[2]);
    expect(keys[1]).not.toEqual(keys[3]);
  });
});
