import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useAppForegroundEffect } from '../useAppForegroundEffect';

describe('useAppForegroundEffect', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shares one AppState listener, fires only on foreground transitions, and removes it when idle', async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, listener) => {
        appStateListener = listener;
        return { remove };
      });
    const firstListener = jest.fn();
    const secondListener = jest.fn();

    const first = await renderHook(() => useAppForegroundEffect(firstListener));
    const second = await renderHook(() => useAppForegroundEffect(secondListener));

    expect(addEventListener).toHaveBeenCalledTimes(1);
    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
      appStateListener?.('active');
    });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    await first.unmount();
    expect(remove).not.toHaveBeenCalled();
    await second.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
