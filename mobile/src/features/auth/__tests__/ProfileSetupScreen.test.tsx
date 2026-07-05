jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));
jest.mock('../api', () => ({
  profileSetupRequest: jest.fn(),
}));
const mockUpdateUser = jest.fn();
jest.mock('../session', () => ({
  useSession: () => ({ status: 'signedIn', user: null, updateUser: mockUpdateUser }),
}));

// eslint-disable-next-line import/first
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { profileSetupRequest } from '../api';
// eslint-disable-next-line import/first
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';

const mockSetup = profileSetupRequest as jest.MockedFunction<typeof profileSetupRequest>;

describe('ProfileSetupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits the identity fields and updates the session user', async () => {
    const updated = { id: 'u1', requires_profile_setup: false };
    mockSetup.mockResolvedValue(updated as never);

    await render(<ProfileSetupScreen />);
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Quang');
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Minh');
    await fireEvent.changeText(screen.getByLabelText('Identify name'), 'quangminh');
    await fireEvent.press(screen.getByText('Finish setup'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(updated));
    expect(mockSetup).toHaveBeenCalledWith({ first_name: 'Quang', last_name: 'Minh', identify_name: 'quangminh' });
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
