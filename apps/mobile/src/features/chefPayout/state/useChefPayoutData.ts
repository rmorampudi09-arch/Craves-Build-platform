import React from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey, privateQueryPrefix} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {useChefBankStatus} from '../../chefBankOnboarding/state/useChefBankStatus';
import {chefPayoutApi, type ChefEarningLedgerEntry} from '../api/chefPayoutApi';

const CHEF_ROLE = 'CHEF' as const;
const LEDGER_LIMIT = 200;
const NO_ENTRIES: ChefEarningLedgerEntry[] = [];

const timeOf = (entry: ChefEarningLedgerEntry) => Date.parse(entry.createdAt) || 0;

/** Balance, recent payouts, earnings entries and the bank account: what Earnings and Payout history both read. */
export function useChefPayoutData() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const bank = useChefBankStatus();
  const key = (domain: string, paging?: {limit: number}) =>
    identityId
      ? createPrivateQueryKey(domain, {userId: identityId, role: CHEF_ROLE, ...(paging ? {paging} : {})})
      : (['craves', 'v1', 'private', domain, 'signed-out'] as const);

  const balanceQuery = useQuery({
    queryKey: key('chef-earnings-balance'),
    queryFn: ({signal}) => chefPayoutApi.getBalance(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  const ledgerQuery = useQuery({
    queryKey: key('chef-earnings-ledger', {limit: LEDGER_LIMIT}),
    queryFn: ({signal}) => chefPayoutApi.listEarnings(LEDGER_LIMIT, signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  // Newest first, whatever order the server used.
  const ledger = React.useMemo(
    () => (ledgerQuery.data ? [...ledgerQuery.data].sort((a, b) => timeOf(b) - timeOf(a)) : NO_ENTRIES),
    [ledgerQuery.data],
  );

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([balanceQuery.refetch(), ledgerQuery.refetch(), bank.refetch()]);
  }, [balanceQuery, ledgerQuery, bank]);

  /** After a withdrawal: read the balance again here and on Home, which keeps its own copy. */
  const afterWithdrawal = React.useCallback(async () => {
    await Promise.all([
      balanceQuery.refetch(),
      queryClient.invalidateQueries({queryKey: [...privateQueryPrefix, 'chef-dashboard-balance']}),
    ]);
  }, [balanceQuery, queryClient]);

  return {
    balance: balanceQuery.data ?? null,
    balanceStatus: balanceQuery.status,
    ledger,
    ledgerStatus: ledgerQuery.status,
    /** The most entries the server returns in one read. */
    ledgerLimit: LEDGER_LIMIT,
    bank: bank.bank,
    isRefreshing: balanceQuery.isFetching || ledgerQuery.isFetching || bank.isFetching,
    refresh,
    afterWithdrawal,
  };
}
