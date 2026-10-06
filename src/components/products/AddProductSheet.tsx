import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chips, Icon, Input, Sheet, Stepper, Text } from '@/components/ui';
import { UnitPicker } from '@/components/products/UnitPicker';
import { useCategories } from '@/hooks/queries';
import { categoryById, suggestCategory } from '@/lib/categories';
import { toAppError } from '@/lib/errors';
import { maskBRLInput, parseBRL } from '@/lib/money';
import { showToast } from '@/lib/toast';
import { addProduct } from '@/offline/sync';
import { useUserId } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { isPresetUnit, normalizeUnit, quantityStep } from '@/lib/units';

/** Adicionar produto em 3 passos: nome → quantidade → Adicionar. O resto é opcional. */
export function AddProductSheet({ listId, visible, onClose }: { listId: string; visible: boolean; onClose: () => void }) {
  return visible ? <AddProductForm listId={listId} onClose={onClose} /> : <Sheet visible={false} onClose={onClose} title="Adicionar produto">{null}</Sheet>;
}

function AddProductForm({ listId, onClose }: { listId: string; onClose: () => void }) {
  const userId = useUserId();
  const categories = useCategories();
  const { colors } = useTheme();
  const nameRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<string | null>(null); // opcional
  const [categoryId, setCategoryId] = useState<string | null>(null); // null = automática
  const [pickCategory, setPickCategory] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const suggested = suggestCategory(name, categories);
  const effectiveCategory = categoryId ?? suggested;
  const step = quantityStep(unit);

  const submit = (keepOpen: boolean) => {
    try {
      const estimated = price ? parseBRL(price) : null;
      if (price && estimated == null) throw new Error('Preço inválido');
      addProduct(listId, userId, { name, quantity, unit: normalizeUnit(unit), categoryId: effectiveCategory, estimatedPrice: estimated, note: note || null });
      showToast(`“${name.trim()}” adicionado`, 'success');
      if (keepOpen) {
        setName('');
        setQuantity(1);
        setUnit(null);
        setShowUnits(false);
        setCategoryId(null);
        setPrice('');
        setNote('');
        setShowNote(false);
        nameRef.current?.focus();
      } else onClose();
    } catch (e) {
      setError(e instanceof Error && e.message === 'Preço inválido' ? 'Digite um preço válido, como 12,90.' : toAppError(e).message);
    }
  };

  const canAdd = !!name.trim();
  // Celular: um embaixo do outro (principal em cima). Tablet/computador: lado a lado.
  const footer = (
    <View style={styles.actions}>
      <Button label="Adicionar à lista" icon="plus" size="md" style={styles.action} onPress={() => submit(false)} disabled={!canAdd} />
      <Button
        label="Adicionar e continuar"
        variant="secondary"
        size="md"
        style={styles.action}
        onPress={() => submit(true)}
        disabled={!canAdd}
        accessibilityHint="Adiciona este produto e deixa o formulário aberto para o próximo"
      />
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title="Adicionar produto" footer={footer}>
      <View style={{ gap: 6 }}>
        <Input
          ref={nameRef}
          label="Produto"
          placeholder="Ex.: Leite integral"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && submit(true)}
          error={error}
          maxLength={120}
          autoCapitalize="sentences"
          autoFocus
        />
        {name.trim() ? (
          <Text variant="caption" tone="muted">
            Categoria: <Text variant="caption" style={{ color: colors.text }}>{categoryById(effectiveCategory, categories).emoji} {categoryById(effectiveCategory, categories).name}</Text>
            {'  '}
            <Text variant="caption" tone="primary" onPress={() => setPickCategory((v) => !v)} accessibilityRole="button" suppressHighlighting>
              {pickCategory ? 'ok' : 'trocar'}
            </Text>
          </Text>
        ) : null}
      </View>

      {pickCategory ? (
        <Chips
          label="Categoria"
          value={effectiveCategory}
          onChange={(v) => setCategoryId(v)}
          options={categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
        />
      ) : null}

      {/* Quantidade e preço lado a lado (empilham em telas estreitas) */}
      <View style={styles.row}>
        <View style={{ gap: 6 }}>
          <Text variant="bodyStrong" style={{ fontSize: 14 }}>Quantidade</Text>
          <Stepper label="Quantidade" value={quantity} step={step} min={step} onChange={setQuantity} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Input
            label="Preço estimado"
            placeholder="R$ 0,00"
            keyboardType="number-pad"
            value={price}
            onChangeText={(t) => setPrice(maskBRLInput(t))}
            hint={unit ? `por ${unit}` : 'por unidade (opcional)'}
          />
        </View>
      </View>

      {/* Unidade: botão opcional que abre as opções */}
      <View style={{ gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showUnits }}
          accessibilityLabel={unit ? `Unidade: ${unit}. Toque para alterar` : 'Escolher unidade (opcional)'}
          onPress={() => setShowUnits((v) => !v)}
          style={({ pressed }) => [
            styles.toggle,
            { borderColor: unit ? colors.primary : colors.lineStrong, backgroundColor: unit ? colors.primarySoft : 'transparent', opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="bodyStrong" style={{ fontSize: 14, color: unit ? colors.text : colors.textSubtle }}>
            {unit ? `Unidade: ${unit}` : '+ Unidade'}
            {!unit ? <Text variant="caption" tone="muted"> (opcional)</Text> : null}
          </Text>
          <Icon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
        {showUnits ? (
          <UnitPicker
            hideTitle
            value={unit}
            onChange={(u) => {
              setUnit(u);
              // Escolheu uma das sugeridas: fecha. "Outros" fica aberto para digitar.
              if (u && isPresetUnit(u)) setShowUnits(false);
            }}
          />
        ) : null}
      </View>

      {showNote ? (
        <Input label="Observação" placeholder="Marca, tamanho, sabor…" value={note} onChangeText={setNote} maxLength={500} autoFocus />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setShowNote(true)} style={({ pressed }) => [styles.toggle, { borderColor: colors.lineStrong, borderStyle: 'dashed', opacity: pressed ? 0.7 : 1 }]}>
          <Text variant="bodyStrong" style={{ fontSize: 14, color: colors.textSubtle }}>
            + Observação<Text variant="caption" tone="muted"> (opcional)</Text>
          </Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  toggle: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 240 },
});
