import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {chefBankOnboardingApi, type ChefBankState, type ChefBankStatus} from '../api/chefBankOnboardingApi';

const CHEF_ROLE = 'CHEF' as const;
const POLL_MS = 15_000;
/** While the bank is still checking the account, ask again every so often. */
const CHECKING_STATES = new Set<ChefBankState>(['QUEUED', 'SUBMITTING', 'VALIDATING', 'UNKNOWN', 'WAITING_APPROVAL']);

/** The chef's payout bank account, shared by the Earnings tab, the withdraw sheet and the Bank account screen. */
export function useChefBankStatus() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const queryKey = identityId
    ? createPrivateQueryKey('chef-bank-status', {userId: identityId, role: CHEF_ROLE})
    : (['craves', 'v1', 'private', 'chef-bank-status', 'signed-out'] as const);

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => chefBankOnboardingApi.getStatus(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
    refetchInterval: current => (current.state.data && CHECKING_STATES.has(current.state.data.state) ? POLL_MS : false),
  });

  return {
    /** Null until it loads, and when it cannot be read. */
    bank: query.data ?? null,
    status: query.status,
    isFetching: query.isFetching,
    refetch: query.refetch,
    /** Puts a fresh answer (the result of saving a new account) straight in. */
    setBank: (bank: ChefBankStatus) => queryClient.setQueryData(queryKey, bank),
  };
}
