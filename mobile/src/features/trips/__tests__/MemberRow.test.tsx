jest.mock('expo-image', () => ({ Image: () => null }));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { MemberRow } from '../components/MemberRow';
// eslint-disable-next-line import/first
import type { TripMember } from '../types';

const member: TripMember = {
  membership_id: 'membership-2',
  user: {
    id: 'user-2',
    display_name: 'Lan Nguyen',
    identify_tag: 'lan#1234',
    avatar_url: null,
  },
  role: 'MEMBER',
  joined_at: '2026-01-02T00:00:00Z',
};

describe('MemberRow', () => {
  it('only offers removal when captain controls explicitly enable it', async () => {
    const onRemoveRequest = jest.fn();
    const { rerender } = await render(
      <MemberRow member={member} onRemoveRequest={onRemoveRequest} />,
    );
    expect(screen.queryByRole('button', { name: 'Remove Lan Nguyen from trip' })).toBeNull();

    await rerender(
      <MemberRow member={member} showRemove onRemoveRequest={onRemoveRequest} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Lan Nguyen from trip' }));
    expect(onRemoveRequest).toHaveBeenCalledWith('user-2', 'Lan Nguyen');
  });

  it('locks the remove control while its mutation is running', async () => {
    const onRemoveRequest = jest.fn();
    await render(
      <MemberRow member={member} showRemove removing onRemoveRequest={onRemoveRequest} />,
    );
    const button = screen.getByRole('button', { name: 'Remove Lan Nguyen from trip' });
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(button);
    expect(onRemoveRequest).not.toHaveBeenCalled();
  });
});
