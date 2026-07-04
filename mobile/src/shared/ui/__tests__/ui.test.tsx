import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { FormError } from '../FormError';

describe('Button', () => {
  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} />);
    fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses and shows a spinner while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} loading />);
    expect(screen.queryByText('Sign in')).toBeNull();
    fireEvent.press(screen.getByTestId('button-pressable'));
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
    rerender(<FormError error={{ kind: 'field', message: 'x', fieldErrors: {} }} />);
    expect(screen.queryByText('x')).toBeNull();
    rerender(<FormError error={null} />);
  });
});
