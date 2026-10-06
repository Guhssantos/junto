import { requestPasswordReset, resetPasswordWithCode, signIn, signOut, signUp } from '@/services/auth';

const mockAuth = {
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  verifyOtp: jest.fn(),
  updateUser: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ supabase: { get auth() { return mockAuth; } } }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockAuth).forEach((fn) => fn.mockResolvedValue({ data: { session: {} }, error: null }));
});

describe('cadastro', () => {
  it('cria conta com nome nos metadados e e-mail normalizado', async () => {
    await signUp({ name: ' Gustavo ', email: ' Gustavo@Email.com ', password: 'senha1234' });
    expect(mockAuth.signUp).toHaveBeenCalledWith({ email: 'gustavo@email.com', password: 'senha1234', options: { data: { name: 'Gustavo' }, emailRedirectTo: undefined } });
  });
  it('avisa quando precisa confirmar o e-mail', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(signUp({ name: 'G', email: 'g@e.com', password: 'senha1234' })).resolves.toEqual({ needsConfirmation: true });
  });
  it.each([
    [{ name: '', email: 'g@e.com', password: 'senha1234' }, 'Digite seu nome.'],
    [{ name: 'G', email: 'nao-e-email', password: 'senha1234' }, 'Digite um e-mail válido.'],
    [{ name: 'G', email: 'g@e.com', password: 'curta1' }, 'A senha precisa ter pelo menos 8 caracteres.'],
    [{ name: 'G', email: 'g@e.com', password: 'somenteletras' }, 'Use letras e números na senha.'],
  ])('valida os dados %#', async (input, msg) => {
    await expect(signUp(input)).rejects.toThrow(msg);
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });
  it('traduz e-mail já cadastrado', async () => {
    mockAuth.signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered', code: 'user_already_exists' } });
    await expect(signUp({ name: 'G', email: 'g@e.com', password: 'senha1234' })).rejects.toThrow('Já existe uma conta com este e-mail.');
  });
});

describe('login e logout', () => {
  it('entra com e-mail e senha', async () => {
    await signIn({ email: 'g@e.com', password: 'x' });
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'g@e.com', password: 'x' });
  });
  it('mensagem clara para credenciais inválidas', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials', status: 400 } });
    await expect(signIn({ email: 'g@e.com', password: 'errada' })).rejects.toThrow('E-mail ou senha incorretos.');
  });
  it('sai apenas deste aparelho', async () => {
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('recuperação de senha', () => {
  it('envia o código por e-mail', async () => {
    await requestPasswordReset('g@e.com');
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('g@e.com');
  });
  it('valida o código e grava a nova senha', async () => {
    await resetPasswordWithCode({ email: 'g@e.com', code: '123 456', password: 'novaSenha1' });
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'g@e.com', token: '123456', type: 'recovery' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'novaSenha1' });
  });
  it('código expirado tem mensagem clara', async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    await expect(resetPasswordWithCode({ email: 'g@e.com', code: '000000', password: 'novaSenha1' })).rejects.toThrow('Código inválido ou expirado');
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });
});
