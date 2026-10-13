import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {chefBusinessInformationApi} from '../../chefBusinessInformation/api/chefBusinessInformationApi';

const CHEF_ROLE = 'CHEF' as const;

/** The name on the chef's application: the bank account must be in this name, so the form shows it locked. */
export function useChefApplicantName() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const query = useQuery({
    queryKey: identityId
      ? createPrivateQueryKey('chef-bank-applicant', {userId: identityId, role: CHEF_ROLE})
      : (['craves', 'v1', 'private', 'chef-bank-applicant', 'signed-out'] as const),
    queryFn: ({signal}) => chefBusinessInformationApi.getVerificationRecord(signal),
    enabled: identityId !== null,
    staleTime: 5 * 60_000,
  });

  const record = query.data;
  const name = [record?.firstName, record?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return {
    name,
    /** A bank account can be added while the application is pending or approved, in the applicant's name. */
    eligible: (record?.status === 'PENDING' || record?.status === 'APPROVED') && name.length >= 2,
    status: query.status,
  };
}
