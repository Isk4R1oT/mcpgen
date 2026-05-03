// apps/web/src/components/ui/__tests__/input.test.tsx
//
// F-UIKit — `<Input>` emits canon `mc-input` + `mc-mono` modifier; controlled
// onChange wiring + forwarded HTML attrs.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Input } from '../input';

afterEach(() => cleanup());

describe('<Input>', () => {
  it('renders mc-input by default + type=text', () => {
    const { container } = render(<Input value="" onChange={() => undefined} />);
    const el = container.querySelector('input');
    expect(el?.className).toContain('mc-input');
    expect(el?.type).toBe('text');
  });

  it('appends mc-mono when mono=true', () => {
    const { container } = render(<Input mono value="" onChange={() => undefined} />);
    expect(container.querySelector('input')?.className).toContain('mc-mono');
  });

  it('passes value + onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<Input value="abc" onChange={onChange} />);
    const el = container.querySelector('input') as HTMLInputElement;
    expect(el.value).toBe('abc');
    fireEvent.change(el, { target: { value: 'xyz' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards placeholder, autoFocus, disabled', () => {
    const { container } = render(
      <Input
        value=""
        onChange={() => undefined}
        placeholder="https://api.example.com/openapi.json"
        autoFocus
        disabled
      />,
    );
    const el = container.querySelector('input') as HTMLInputElement;
    expect(el.placeholder).toBe('https://api.example.com/openapi.json');
    expect(el.disabled).toBe(true);
  });
});
