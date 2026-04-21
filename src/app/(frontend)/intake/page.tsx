import { getSessionPrefill } from '@/lib/stripe'
import { IntakeForm } from './IntakeForm'
import { StripeError } from './StripeError'
import type { SessionPrefill } from '@/lib/stripe'

interface IntakePageProps {
  searchParams: Promise<{ session?: string }>
}

export default async function IntakePage({ searchParams }: IntakePageProps) {
  const { session: sessionId } = await searchParams

  let sessionData: SessionPrefill | null = null

  if (sessionId?.startsWith('cs_')) {
    sessionData = await getSessionPrefill(sessionId)
  }

  // Hard block — session present but payment explicitly didn't go through
  const isPaymentFailed =
    sessionData !== null && !sessionData.ok && sessionData.reason === 'payment_failed'

  // Soft block — session present but something unexpected happened; show error + form
  const isUnexpected =
    sessionData !== null && !sessionData.ok && sessionData.reason === 'unexpected'

  const prefill = sessionData?.ok ? sessionData.prefill : undefined
  const stripeData = sessionData?.ok ? sessionData.stripe : undefined
  const jobAutoFill = sessionData?.ok ? sessionData.jobAutoFill : undefined

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Pet Portrait Commission Intake</h1>

      {isPaymentFailed && (
        <StripeError
          type="payment_failed"
          message="It looks like your payment didn't go through. Please get in touch so we can help."
        />
      )}

      {isUnexpected && (
        <StripeError
          type="unexpected"
          message="Something unexpected happened verifying your session. Please contact us, or fill out the form below and we'll sort it out."
        />
      )}

      {!isPaymentFailed && (
        <>
          {!isUnexpected && (
            <p className="mb-8 text-gray-600">
              Please provide information about your pet(s) and upload reference
              photos. This helps us create the perfect portrait!
            </p>
          )}
          <IntakeForm
            prefill={prefill}
            stripeData={stripeData}
            jobAutoFill={jobAutoFill}
          />
        </>
      )}
    </div>
  )
}
