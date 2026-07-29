(() => {
  const promise = document.querySelector(".support-hero .promise");
  if (promise) {
    promise.textContent = "Standard event listings and standard local business listings will always remain free. Voluntary contributions help Texoma Weekend Guide grow. Optional paid advertising provides additional visibility through clearly labeled sponsored placements and promotional campaigns. Advertising is never required to be listed in Texoma Weekend Guide.";
  }

  const faqCards = [...document.querySelectorAll(".faq-card")];
  const listingCard = faqCards.find((card) =>
    card.querySelector("h3")?.textContent?.toLowerCase().includes("standard promotion")
  );

  if (listingCard) {
    const heading = listingCard.querySelector("h3");
    const answer = listingCard.querySelector("p");

    if (heading) heading.textContent = "Are standard listings still free?";
    if (answer) {
      answer.textContent = "Yes. Standard event listings and standard local business listings will always remain free. Businesses may choose optional paid advertising for additional visibility through clearly labeled sponsored placements or promotional campaigns, but advertising is never required to be listed. Contributions are always voluntary and help Texoma Weekend Guide continue growing.";
    }
  }
})();