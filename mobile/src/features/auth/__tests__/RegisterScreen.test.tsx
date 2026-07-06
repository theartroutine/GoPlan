jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Link: () => null,
}));
jest.mock('../api', () => ({
  registerRequest: jest.fn(),
}));

// eslint-disable-next-line import/first
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { registerRequest } from '../api';
// eslint-disable-next-line import/first
import { RegisterScreen } from '../screens/RegisterScreen';

const mockRegister = registerRequest as jest.MockedFunction<typeof registerRequest>;

describe('RegisterScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks submission when passwords do not match', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'owner@goplan.dev');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'different');
    await fireEvent.press(screen.getByText('Create account'));

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registers and routes to verify-email on 202', async () => {
    mockRegister.mockResolvedValue({ detail: 'If registration can continue, check your email.' });
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'owner@goplan.dev');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'secret123');
    await fireEvent.press(screen.getByText('Create account'));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/(auth)/verify-email',
        params: { email: 'owner@goplan.dev' },
      }),
    );
  });
});
