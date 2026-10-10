import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AccountTabs from './AccountTabs';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}{location.search}</div>;
}

afterEach(() => cleanup());

describe('AccountTabs', () => {
  it('shows three tabs for owners and marks the active one', () => {
    render(
      <MemoryRouter>
        <AccountTabs active="settings" owner />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tab', { name: 'الملف الشخصي' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'الإعدادات' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'الإدارة' })).toBeInTheDocument();
  });

  it('hides admin for non-owners', () => {
    render(
      <MemoryRouter>
        <AccountTabs active="profile" owner={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('tab', { name: 'الإدارة' })).toBeNull();
    expect(screen.getByRole('tablist')).toHaveClass('is-two');
  });

  it('navigates to account routes', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AccountTabs active="admin" owner />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'الإعدادات' }));
    expect(screen.getByTestId('path').textContent).toBe('/account?tab=settings');
    fireEvent.click(screen.getByRole('tab', { name: 'الملف الشخصي' }));
    expect(screen.getByTestId('path').textContent).toBe('/account');
  });
});
