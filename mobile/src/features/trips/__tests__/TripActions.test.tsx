import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { getTripDisplayActions, TripActions } from '../components/TripActions';
import type { MyMembership, TripStatus } from '../types';

const activeCaptain: Pick<MyMembership, 'role' | 'status'> = { role: 'CAPTAIN', status: 'ACTIVE' };
const activeMember: Pick<MyMembership, 'role' | 'status'> = { role: 'MEMBER', status: 'ACTIVE' };

function renderActions(
  status: TripStatus,
  membership: Pick<MyMembership, 'role' | 'status'> | null,
  overrides: Partial<React.ComponentProps<typeof TripActions>> = {},
) {
  return render(
    <TripActions
      trip={{ status }}
      membership={membership}
      isMutating={false}
      onAction={jest.fn()}
      {...overrides}
    />,
  );
}

describe('getTripDisplayActions', () => {
  it.each([
    ['PLANNING', activeCaptain, ['edit', 'start', 'cancel']],
    ['ONGOING', activeCaptain, ['edit', 'complete', 'cancel']],
    ['COMPLETED', activeCaptain, []],
    ['CANCELLED', activeCaptain, []],
    ['PLANNING', activeMember, ['leave']],
    ['ONGOING', activeMember, ['leave']],
    ['COMPLETED', activeMember, []],
    ['CANCELLED', activeMember, []],
  ] as const)('returns %p actions for %p', (status, membership, expected) => {
    expect(getTripDisplayActions(status, membership)).toEqual(expected);
  });

  it('returns no actions for missing or inactive membership', () => {
    expect(getTripDisplayActions('PLANNING', null)).toEqual([]);
    expect(getTripDisplayActions('PLANNING', { role: 'MEMBER', status: 'LEFT' })).toEqual([]);
  });
});

describe('TripActions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dispatches edit and start without a confirmation', async () => {
    const onAction = jest.fn();
    await renderActions('PLANNING', activeCaptain, { onAction });

    await fireEvent.press(screen.getByRole('button', { name: 'Edit trip' }));
    expect(onAction).toHaveBeenCalledWith('edit');
  });

  it('confirms destructive lifecycle actions before dispatching', async () => {
    const onAction = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    await renderActions('ONGOING', activeCaptain, { onAction });

    await fireEvent.press(screen.getByRole('button', { name: 'Complete trip' }));

    expect(alertSpy).toHaveBeenCalledWith(
      'Complete this trip?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Complete trip', style: 'destructive' })]),
      expect.objectContaining({ cancelable: true }),
    );
    expect(onAction).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0]?.[2];
    const confirm = buttons?.find((button) => button.text === 'Complete trip');
    confirm?.onPress?.();
    expect(onAction).toHaveBeenCalledWith('complete');
  });

  it('blocks all actions while a mutation is in flight', async () => {
    const onAction = jest.fn();
    await renderActions('PLANNING', activeCaptain, { isMutating: true, onAction });

    expect(screen.getByRole('button', { name: 'Edit trip' }).props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Edit trip' }));
    expect(onAction).not.toHaveBeenCalled();
  });
});
