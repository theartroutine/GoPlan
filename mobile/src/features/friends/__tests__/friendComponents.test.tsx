jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { FriendAvatar } from '../components/FriendAvatar';
// eslint-disable-next-line import/first
import { FriendRequestRow } from '../components/FriendRequestRow';
// eslint-disable-next-line import/first
import { FriendRow } from '../components/FriendRow';

describe('friend presentation components', () => {
  it('renders accessible fallback initials and identity fields', async () => {
    await render(
      <FriendRow
        friendshipId="friendship-1"
        displayName="Alice Nguyen"
        identifyTag="alice#ABC123"
        avatarUrl={null}
        removing={false}
        onRemoveRequest={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Avatar for Alice Nguyen, alice#ABC123')).toBeTruthy();
    expect(screen.getByText('AN')).toBeTruthy();
    expect(screen.getByText('Alice Nguyen')).toBeTruthy();
    expect(screen.getByText('alice#ABC123')).toBeTruthy();
  });

  it('resolves a relative avatar URL through the API media endpoint', async () => {
    await render(
      <FriendAvatar displayName="Alice" identifyTag="alice#ABC123" avatarUrl="/media/avatars/alice.jpg" />,
    );

    const avatar = screen.getByLabelText('Avatar for Alice, alice#ABC123');
    const image = avatar.props.children;
    expect(image.props.source).toEqual({ uri: 'http://testserver:8000/api/media/files/avatars/alice.jpg' });
  });

  it('requests confirmation with friendship identity and disables duplicate removal', async () => {
    const onRemoveRequest = jest.fn();
    const view = await render(
      <FriendRow
        friendshipId="friendship-1"
        displayName="Alice Nguyen"
        identifyTag="alice#ABC123"
        avatarUrl={null}
        removing={false}
        onRemoveRequest={onRemoveRequest}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Remove Alice Nguyen'));
    expect(onRemoveRequest).toHaveBeenCalledWith('friendship-1', 'Alice Nguyen');

    await view.rerender(
      <FriendRow
        friendshipId="friendship-1"
        displayName="Alice Nguyen"
        identifyTag="alice#ABC123"
        avatarUrl={null}
        removing
        onRemoveRequest={onRemoveRequest}
      />,
    );
    const removeButton = screen.getByLabelText('Remove Alice Nguyen');
    expect(removeButton.props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(removeButton);
    expect(onRemoveRequest).toHaveBeenCalledTimes(1);
  });

  it('routes incoming request actions with the request ID', async () => {
    const onAction = jest.fn();
    await render(
      <FriendRequestRow
        requestId="request-1"
        displayName="Bob Tran"
        identifyTag="bob#DEF456"
        avatarUrl={null}
        direction="incoming"
        pendingAction={null}
        onAction={onAction}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Accept Bob Tran'));
    await fireEvent.press(screen.getByLabelText('Decline Bob Tran'));

    expect(onAction).toHaveBeenNthCalledWith(1, 'request-1', 'accept');
    expect(onAction).toHaveBeenNthCalledWith(2, 'request-1', 'decline');
    expect(screen.queryByLabelText('Cancel request to Bob Tran')).toBeNull();
  });

  it('shows only Cancel for outgoing requests and exposes the pending mutation state', async () => {
    await render(
      <FriendRequestRow
        requestId="request-2"
        displayName="Carol Le"
        identifyTag="carol#GHI789"
        avatarUrl={null}
        direction="outgoing"
        pendingAction="cancel"
        onAction={jest.fn()}
      />,
    );

    const cancelButton = screen.getByLabelText('Cancel request to Carol Le');
    expect(cancelButton.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(screen.queryByLabelText('Accept Carol Le')).toBeNull();
    expect(screen.queryByLabelText('Decline Carol Le')).toBeNull();
  });
});
