# PenGems Hall of Fame

Static archive site for PenGems Hall of Fame pens.

## Updating the data

Yes: the update starts by putting a CSV export in the repo, then running the build script. The site itself reads `data/pens.json`; you should not edit that JSON by hand unless you are doing a one-off emergency fix.

### Quick update steps

1. Export the product data as a CSV.
2. Save the export in the repo root as:

   ```text
   Hall of Fame Update.csv
   ```

   Replace the old file with the new export.

3. Run the build script from the repo root:

   ```bash
   node scripts/build-archive-data.mjs
   ```

4. Check the generated files:

   ```text
   data/pens.json
   data/pengems-hall-of-fame.csv
   assets/pens/
   ```

5. Commit the updated CSV, generated JSON/CSV, and any new images in `assets/pens/`.

## CSV format

Use the raw product export CSV format, including the launch-date metafield. The script looks for products tagged `hall-of-fame`, so every pen you want included must have `hall-of-fame` in the `Product Tags` column.

The current script expects the source CSV to be named `Hall of Fame Update.csv` and expects product columns like these:

```csv
"Product Id","Product Type","Collection Titles","Product Tags","Product Title","Product Description (Plain Text)","Product Category","Product Handle","Product Created At","Product Published At","Product Image","Product.custom.launch"
```

Important fields:

- `Product Title`: the pen name shown on the site.
- `Product Tags`: must include `hall-of-fame`.
- `Product.custom.launch`: used as the release date. Dates are converted to `YYYY-MM-DD`.
- `Product Handle`: used to make the stable pen id and URL-friendly handle.
- `Product Image`: one or more image URLs. The script downloads these into `assets/pens/`.
- `Variant Image`: optional variant-specific image URL.

The launch date column may also be exported with a slightly different label, such as `product.custom.launch`, `custom.launch`, `Custom Launch`, `Launch`, `Metafield: custom.launch`, `Metafield custom.launch`, or `Product Metafield: custom.launch`. If none of those columns are present, the build script will stop instead of guessing from `Product Created At`.

## Generated files

Running `node scripts/build-archive-data.mjs` does four things:

- Reads `Hall of Fame Update.csv`.
- Writes the site data to `data/pens.json`.
- Writes a simpler customer-facing CSV to `data/pengems-hall-of-fame.csv`.
- Downloads any missing product images into `assets/pens/`.

The file `data/pengems-hall-of-fame.csv` is an output file, not the source file for updates. It only has:

```csv
Pen Name,Release Date,Year,Handle,Image
```

That smaller CSV is useful for sharing or downloading from the site, but it does not contain enough information to rebuild the archive.
