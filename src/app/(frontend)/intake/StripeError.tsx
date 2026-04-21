interface StripeErrorProps {
  type: 'payment_failed' | 'unexpected'
  message: string
}

export function StripeError({ type, message }: StripeErrorProps) {
  const isHard = type === 'payment_failed'

  return (
    <div
      className={`mb-6 rounded-lg border p-5 ${
        isHard
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-yellow-200 bg-yellow-50 text-yellow-900'
      }`}
    >
      <p className="font-semibold mb-1">
        {isHard ? 'Payment not completed' : 'Something unexpected happened'}
      </p>
      <p className="text-sm">{message}</p>
      <p className="text-sm mt-2">
        Email us at{' '}
        <a href="mailto:alvar@petportraits.ink" className="underline font-medium">
          alvar@petportraits.ink
        </a>{' '}
        and we&apos;ll get you sorted.
      </p>
    </div>
  )
}
