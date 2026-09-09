import { TextField } from '@kobalte/core/text-field';
import { Select } from '@kobalte/core/select';
import { Switch } from '@kobalte/core/switch';
import { Button } from '@kobalte/core/button';
import { createSignal, type JSX, Show } from 'solid-js';
import './forms.css';

export type FieldError = string | undefined;

export function Form(props: {
  onSubmit: (e: Event) => void | Promise<void>;
  children: JSX.Element;
  class?: string;
}) {
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal('');
  return (
    <form
      class={`bf-form ${props.class || ''}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError('');
        try {
          await props.onSubmit(e);
        } catch (err: any) {
          setError(err?.message || 'Form failed');
        } finally {
          setPending(false);
        }
      }}
    >
      {props.children}
      <Show when={error()}>
        <p class="bf-error" role="alert">{error()}</p>
      </Show>
      <input type="hidden" data-pending={pending() ? '1' : '0'} />
    </form>
  );
}

export function TextInput(props: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  description?: string;
  error?: FieldError;
  placeholder?: string;
}) {
  return (
    <TextField
      class="bf-field"
      value={props.value}
      onChange={props.onChange}
      validationState={props.error ? 'invalid' : 'valid'}
      required={props.required}
    >
      <TextField.Label class="bf-label">{props.label}</TextField.Label>
      <TextField.Input class="bf-control" name={props.name} type={props.type || 'text'} placeholder={props.placeholder} />
      <Show when={props.description}>
        <TextField.Description class="bf-hint">{props.description}</TextField.Description>
      </Show>
      <Show when={props.error}>
        <TextField.ErrorMessage class="bf-error">{props.error}</TextField.ErrorMessage>
      </Show>
    </TextField>
  );
}

export function TextAreaInput(props: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: FieldError;
}) {
  return (
    <TextField class="bf-field" value={props.value} onChange={props.onChange} validationState={props.error ? 'invalid' : 'valid'}>
      <TextField.Label class="bf-label">{props.label}</TextField.Label>
      <TextField.TextArea class="bf-control bf-textarea" name={props.name} autoResize />
      <Show when={props.error}>
        <TextField.ErrorMessage class="bf-error">{props.error}</TextField.ErrorMessage>
      </Show>
    </TextField>
  );
}

export function SelectInput<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  description?: string;
}) {
  const selected = () => props.options.find((o) => o.value === props.value) || null;
  return (
    <div class="bf-field">
      <label class="bf-label">{props.label}</label>
      <Select
        value={selected()}
        options={props.options}
        onChange={(v) => v && props.onChange(v.value)}
        optionValue="value"
        optionTextValue="label"
        placeholder="Select…"
        itemComponent={(itemProps) => (
          <Select.Item item={itemProps.item} class="bf-select-item">
            <Select.ItemLabel>{itemProps.item.rawValue.label}</Select.ItemLabel>
          </Select.Item>
        )}
      >
        <Select.Trigger class="bf-control bf-select-trigger" aria-label={props.label}>
          <Select.Value<typeof props.options[number]>>{(state) => state.selectedOption()?.label || 'Select…'}</Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content class="bf-select-content">
            <Select.Listbox />
          </Select.Content>
        </Select.Portal>
      </Select>
      <Show when={props.description}>
        <p class="bf-hint">{props.description}</p>
      </Show>
    </div>
  );
}

export function SwitchInput(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch class="bf-switch" checked={props.checked} onChange={props.onChange}>
      <Switch.Input />
      <Switch.Control class="bf-switch-control">
        <Switch.Thumb class="bf-switch-thumb" />
      </Switch.Control>
      <Switch.Label class="bf-label">{props.label}</Switch.Label>
    </Switch>
  );
}

export function SubmitButton(props: { children: JSX.Element; disabled?: boolean }) {
  return (
    <Button class="btn btn-primary" type="submit" disabled={props.disabled}>
      {props.children}
    </Button>
  );
}

export function SecretField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  const [reveal, setReveal] = createSignal(false);
  return (
    <div class="bf-field">
      <TextInput
        label={props.label}
        name={props.name}
        value={props.value}
        onChange={props.onChange}
        type={reveal() ? 'text' : 'password'}
        description="Secret values are never echoed back from the API."
      />
      <button type="button" class="btn btn-ghost" onClick={() => setReveal((v) => !v)}>
        {reveal() ? 'Hide' : 'Reveal'}
      </button>
    </div>
  );
}
