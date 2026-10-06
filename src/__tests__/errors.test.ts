import { AppError, isNetworkError, toAppError, unwrap } from '@/lib/errors';

describe('mensagens de erro', () => {
  it('traduz códigos do banco', () => {
    const e = toAppError({ message: 'forbidden', code: 'P0001' });
    expect(e.kind).toBe('forbidden');
    expect(e.message).toBe('Você não tem permissão para fazer isso nesta lista.');
    expect(toAppError({ message: 'list_unavailable' }).kind).toBe('list_unavailable');
  });
  it('nunca mostra "Error 500"', () => {
    const e = toAppError({ message: 'Internal Server Error', status: 500 });
    expect(e.kind).toBe('server');
    expect(e.message).not.toMatch(/500/);
  });
  it('detecta falta de conexão', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('offline');
    expect(isNetworkError({ message: 'forbidden' })).toBe(false);
  });
  it('traduz login inválido do Supabase', () => {
    expect(toAppError({ message: 'Invalid login credentials', status: 400 }).message).toBe('E-mail ou senha incorretos.');
    expect(toAppError({ message: 'x', code: 'weak_password' }).kind).toBe('validation');
  });
  it('unwrap lança AppError', () => {
    expect(() => unwrap({ data: null, error: { message: 'product_not_found' } })).toThrow(AppError);
    expect(unwrap({ data: 1, error: null })).toBe(1);
  });
});
