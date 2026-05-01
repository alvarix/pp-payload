import React from "react";
import "./styles.css";

export const metadata = {
  description: "Pet portrait commission management.",
  title: {
    default: "PetPortraits.ink",
    template: "%s | PetPortraits.ink",
  },
};

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
