export const metadata = { title: "Commission Intake" };

import Image from "next/image";
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
  const verifiedSessionId = sessionData?.ok ? sessionData.stripe.sessionId : undefined

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      <div className="mx-auto px-4 py-10 max-w-2xl">

        <div className="flex justify-center mb-8">
          <Image
            src="/logo-reversed.png"
            alt="PetPortraits.ink"
            width={300}
            height={100}
            priority
            style={{ height: "auto" }}
          />
        </div>

        <h1 className="text-2xl font-bold mb-2 text-center">Commission Intake</h1>

        <p className="text-center text-stone-400 text-sm mb-8">
          Questions?{" "}
          <a
            href="mailto:alvar@petportraits.ink?subject=intake"
            className="underline text-stone-300 hover:text-white"
          >
            Contact me
          </a>
        </p>

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
              <p className="mb-6 text-stone-400 text-sm">
                Please provide information about your pet(s) and upload reference
                photos. This helps us create the perfect portrait!
              </p>
            )}
            <IntakeForm prefill={prefill} stripeSessionId={verifiedSessionId} />
          </>
        )}

      </div>
    </div>
  )
}
