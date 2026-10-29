import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AddAccountForm } from './add-account-dialog';

describe('Add Account Form & Kind Switching Verification', () => {
  it('renders default bank fields initially', () => {
    const html = renderToString(<AddAccountForm />);
    expect(html).toContain('Account Name');
    expect(html).toContain('Opening Balance');
    expect(html).toContain('Opening Date');
    expect(html).toContain('data-testid="kind-fields-bank"');
  });

  it('contains options for all required account kinds in the selector', () => {
    const html = renderToString(<AddAccountForm />);
    expect(html).toContain('value="bank"');
    expect(html).toContain('value="credit_card"');
    expect(html).toContain('value="fixed_deposit"');
    expect(html).toContain('value="recurring_deposit"');
    expect(html).toContain('value="mutual_fund"');
    expect(html).toContain('value="stocks"');
    expect(html).toContain('value="loan"');
  });
});
