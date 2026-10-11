import { render, screen } from '@testing-library/react';
import CustomRoleBadge from './CustomRoleBadge';

describe('CustomRoleBadge', () => {
  it('renders nothing without a complete role', () => {
    const { container } = render(<CustomRoleBadge user={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the role label for everyone', () => {
    render(<CustomRoleBadge user={{ customRoleLabel: 'حارس', customRoleColors: ['#112233'] }} />);
    expect(screen.getByText('حارس')).toHaveClass('custom-role-pill');
  });
});
