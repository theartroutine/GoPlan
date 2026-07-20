import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { FormError } from '../FormError';

const mockHost = jest.fn(({ children }: { children: import('react').ReactNode }) => children);

jest.mock('@expo/ui/swift-ui', () => ({
  DatePicker: () => null,
  Host: mockHost,
}));

// The module must load after the native Host mock is initialized.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DateField } = require('../DateField') as typeof import('../DateField');

describe('Button', () => {
  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses and shows a spinner while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} loading />);
    expect(screen.queryByText('Sign in')).toBeNull();
    await fireEvent.press(screen.getByTestId('button-pressable'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('renders label and error message', async () => {
    await render(<TextField label="Email" error="Enter a valid email address." />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
  });
});

describe('FormError', () => {
  it('shows message errors and hides field errors', async () => {
    const { rerender } = await render(<FormError error={{ kind: 'message', message: 'Invalid email or password.' }} />);
    expect(screen.getByText('Invalid email or password.')).toBeTruthy();
    await rerender(<FormError error={{ kind: 'field', message: 'x', fieldErrors: {} }} />);
    expect(screen.queryByText('x')).toBeNull();
    await rerender(<FormError error={null} />);
  });
});

describe('DateField', () => {
  it('uses the light color scheme for the native SwiftUI host', async () => {
    await render(<DateField label="Start date" value={new Date(2026, 0, 1)} onChange={jest.fn()} />);

    expect(mockHost.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ colorScheme: 'light' }));
  });
});
