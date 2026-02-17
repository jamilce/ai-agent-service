const axios = require("axios");
const db = require("./db");

const API_KEY =
  "eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJzdWJzY3JpYmVkQVBJcyI6Ilt7XCJVSWRcIjpcIjIyYThkNTQ0LWQ5ZGEtNDQ5My1hNjBmLWY0MWViZTE0Y2Q5MFwiLFwiUHJvamVjdE5hbWVcIjpcIndlYnNpdGVcIn1dIiwidHlwZSI6IngtbW9jY2FlLWFwaWtleSIsImlzcyI6Imh0dHBzOi8vYXBpbS5tb2NjYWUuZ292LmFlIiwiYXVkIjoiaHR0cHM6Ly9hcGltLm1vY2NhZS5nb3YuYWUifQ.JePJdoxG6fHHIc863GSuvHNQ0brOKkOFXj-CBlSSOGg";

// API endpoint
const API_URL = "https://stg-gateway.apim.moccae.gov.ae/website/1/GetContentList";

// Common payload
const BASE_PAYLOAD = {
  contentTypeId: 1062,
  pageSize: 200,
  pageIndex: 1,
  loadMainAttributes: true,
  attributes: [
    "attr.serviceCenter",
    "attr.digitalservice",
    "attr.requiredDocuments",
    "attr.requiredDocuments_string",
    "attr.conditionsAndRequirements",
    "attr.conditionsAndRequirements_string",
    "attr.startServiceLink",
    "attr.subcategory",
    "attr.serviceCode",
    "attr.numberOfUsers",
    "attr.numberOfApplications",
    "attr.sDGGoals",
    "attr.isMostUsed",
    "attr.serviceProcess",
    "attr.serviceProcess_string",
    "attr.documents",
    "attr.relatedServices",
    "attr.serviceChannels",
    "attr.audience",
    "attr.fees",
    "attr.fees_string",
    "attr.serviceTime",
    "attr.faq",
    "attr.notes",
    "attr.numberOfIndividualUsers",
    "attr.numberOfCompanyUsers",
    "attr.numberOfTransactions",
    "attr.usedForms",
    "attr.downloadableForm",
  ],
};

async function fetchAllServices(languageId) {
  let pageIndex = 1;
  let allItems = [];
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching page ${pageIndex} for language ${languageId}...`);

    const payload = {
      ...BASE_PAYLOAD,
      languageId,
      pageIndex,
    };

    const response = await axios.post(API_URL, payload, {
      headers: {
        apikey: API_KEY,
        "Content-Type": "application/json",
      },
    });

    const items = response.data?.data?.items || [];

    if (items.length === 0) {
      hasMore = false;
    } else {
      allItems.push(...items);
      pageIndex++;
    }
  }

  return allItems;
}

function saveServices(services, languageId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO services 
      (service_code, title_en, title_ar, language_id, raw_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    services.forEach((service) => {
      const serviceCode = service?.attr?.serviceCode || "";
      const title = service?.title || "";

      stmt.run(serviceCode, languageId === 1 ? title : null, languageId === 2 ? title : null, languageId, JSON.stringify(service));
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function clearDatabase() {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM services", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  try {
    console.log("Clearing old data...");
    await clearDatabase();

    console.log("Fetching English services...");
    const englishServices = await fetchAllServices(1);
    console.log(`Fetched ${englishServices.length} English services`);

    console.log("Saving English services...");
    await saveServices(englishServices, 1);

    console.log("Fetching Arabic services...");
    const arabicServices = await fetchAllServices(2);
    console.log(`Fetched ${arabicServices.length} Arabic services`);

    console.log("Saving Arabic services...");
    await saveServices(arabicServices, 2);

    console.log("✅ All services loaded successfully.");
    process.exit();
  } catch (error) {
    console.error("❌ Error loading data:", error.message);
    process.exit(1);
  }
}

main();
